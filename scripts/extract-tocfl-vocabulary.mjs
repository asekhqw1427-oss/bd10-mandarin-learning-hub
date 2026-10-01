import { createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tocflA0QwAgentVocabulary } from "./data/tocfl-a0-qw-agent.mjs";

const [courseDirectory, chtIndexPath, chtDataPath, enIndexPath, enDataPath, outputPath] = process.argv.slice(2);

if (!outputPath) {
  throw new Error(
    "Usage: node scripts/extract-tocfl-vocabulary.mjs <course-dir> <cht.idx> <cht.dat> <en.idx> <en.dat> <output.js>",
  );
}

const levelMapping = {
  1: "A0",
  2: "A1",
  3: "A2",
  4: "B1",
  5: "B2",
  6: "C1",
  7: "C2",
};

function parseIndex(path) {
  const source = readFileSync(resolve(path));
  const records = new Map();
  let cursor = 11;

  while (cursor < source.length) {
    const keyLength = source[cursor++];
    if (!keyLength || cursor + keyLength + 6 > source.length) break;

    const hanzi = source.subarray(cursor, cursor + keyLength).toString("utf8");
    cursor += keyLength;
    const offset = source.readUInt32LE(cursor);
    cursor += 4;
    const length = source.readUInt16LE(cursor);
    cursor += 2;
    records.set(hanzi, { offset, length });
  }

  return records;
}

// Dictionary records use a 16-byte block-reset XOR transform. The Hanzi UTF-8
// bytes seed each block; remaining positions use the paired-even mask.
function decodeDictionaryRecord(hanzi, encoded) {
  const key = Buffer.from(hanzi, "utf8");
  return Buffer.from(encoded.map((byte, index) => {
    const localIndex = index % 16;
    const mask = localIndex < key.length
      ? key[localIndex]
      : (Math.floor((localIndex + 1) / 2) * 2) & 0xff;
    return byte ^ mask;
  }));
}

function readDictionaryPayload(index, data, hanzi) {
  const location = index.get(hanzi);
  if (!location) return null;

  const encoded = data.subarray(location.offset, location.offset + location.length);
  try {
    return JSON.parse(decodeDictionaryRecord(hanzi, encoded).toString("utf8"));
  } catch {
    return null;
  }
}

function uniqueStrings(values) {
  return [...new Set(values
    .filter(value => typeof value === "string" && value.trim())
    .map(value => value.trim()))];
}

function firstPinyin(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return Object.keys(payload).find(value => value.trim()) ?? null;
}

function extractEnglish(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  for (const [pinyin, senses] of Object.entries(payload)) {
    if (!pinyin || !Array.isArray(senses)) continue;
    const meanings = uniqueStrings(senses.map(sense => Array.isArray(sense?.t) ? sense.t[1] : null));
    if (!meanings.length) continue;

    return {
      pinyin,
      english: meanings[0],
      definition: meanings.join("; "),
      partOfSpeech: uniqueStrings(senses.map(sense => sense?.k)).join(", ") || null,
    };
  }

  return null;
}

// The app decrypts course text with AES-128-CTR, a zero IV, and the first
// 16 UTF-8 bytes of the course name repeated until it reaches 16 characters.
function decryptCourse(courseName, path) {
  let repeatedName = courseName;
  while (repeatedName.length < 16) repeatedName += repeatedName;

  const key = Buffer.from(repeatedName.slice(0, 16), "utf8");
  const decipher = createDecipheriv("aes-128-ctr", key, Buffer.alloc(16));
  return Buffer.concat([decipher.update(readFileSync(path)), decipher.final()]).toString("utf8");
}

const chtIndex = parseIndex(chtIndexPath);
const enIndex = parseIndex(enIndexPath);
const chtData = readFileSync(resolve(chtDataPath));
const enData = readFileSync(resolve(enDataPath));
const pinyinCache = new Map();
const englishCache = new Map();

function pinyinForCharacter(hanzi) {
  if (!pinyinCache.has(hanzi)) {
    const traditionalPayload = readDictionaryPayload(chtIndex, chtData, hanzi);
    const englishPayload = readDictionaryPayload(enIndex, enData, hanzi);
    pinyinCache.set(hanzi, firstPinyin(traditionalPayload) ?? firstPinyin(englishPayload));
  }
  return pinyinCache.get(hanzi);
}

function englishForCharacter(hanzi) {
  if (!englishCache.has(hanzi)) {
    englishCache.set(hanzi, extractEnglish(readDictionaryPayload(enIndex, enData, hanzi)));
  }
  return englishCache.get(hanzi);
}

function pinyinForVariant(variant) {
  const readings = [];
  for (const character of [...variant]) {
    const pinyin = pinyinForCharacter(character);
    if (!pinyin) return null;
    readings.push(pinyin);
  }
  return readings.join(" ");
}

function parseCourseEntry(courseName, tocflLevel, rawHanzi, courseIndex) {
  const qwA0Entry = tocflLevel === 1 ? tocflA0QwAgentVocabulary[courseIndex] : null;
  const sourceHanzi = qwA0Entry?.traditional || rawHanzi;
  const variants = sourceHanzi.split("/").map(value => value.trim()).filter(Boolean);
  const decodedVariants = variants
    .map(variant => ({ hanzi: variant, pinyin: pinyinForVariant(variant) }))
    .filter(variant => variant.pinyin);
  const pinyin = uniqueStrings(decodedVariants.map(variant => variant.pinyin)).join(" / ");

  // The supplied English dictionary is character-based. Only use English
  // fields when a course variant is itself one dictionary character.
  const englishSource = tocflLevel === 1 ? null : variants
    .filter(variant => [...variant].length === 1)
    .map(variant => ({ hanzi: variant, record: englishForCharacter(variant) }))
    .find(candidate => candidate.record);

  const needsParser = [];
  if (!pinyin) needsParser.push("pinyin");
  if (decodedVariants.length < variants.length) needsParser.push("some variant pinyin");
  if (!qwA0Entry && !englishSource) needsParser.push("English meaning / definition");

  return {
    id: `tocfl-${tocflLevel}-${courseIndex + 1}`,
    hanzi: sourceHanzi,
    pinyin: qwA0Entry?.pinyin || pinyin || "",
    english: qwA0Entry?.basic_definition || englishSource?.record.english || "",
    basic_definition: qwA0Entry?.basic_definition || null,
    definition: qwA0Entry?.definition || englishSource?.record.definition || "",
    definition_source: qwA0Entry?.definition_source || null,
    examples: qwA0Entry?.examples || [],
    partOfSpeech: englishSource?.record.partOfSpeech || null,
    cefr: levelMapping[tocflLevel],
    tocflLevel,
    topic: "Common Words",
    source: courseName,
    ...(englishSource ? { englishSourceHanzi: englishSource.hanzi } : {}),
    ...(needsParser.length ? { needsParser } : {}),
  };
}

const vocabulary = [];
const courseCounts = {};

for (let tocflLevel = 1; tocflLevel <= 7; tocflLevel += 1) {
  const courseName = `TOCFL-${tocflLevel}`;
  const plaintext = decryptCourse(courseName, join(resolve(courseDirectory), `${courseName}.bin`));
  const entries = plaintext.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  courseCounts[courseName] = entries.length;
  entries.forEach((hanzi, index) => vocabulary.push(parseCourseEntry(courseName, tocflLevel, hanzi, index)));
}

const tocflA0Entries = vocabulary.filter(entry => entry.tocflLevel === 1);
const missingA0Meanings = tocflA0Entries
  .filter(entry => !entry.basic_definition || !entry.definition || entry.definition_source !== "QW AI-Agent" || entry.examples.length < 2)
  .map(entry => entry.hanzi);

if (missingA0Meanings.length || tocflA0Entries.length !== 145 || tocflA0Entries.some((entry, index) => entry.hanzi !== tocflA0QwAgentVocabulary[index].traditional)) {
  throw new Error(`Invalid A0 AI layer: ${JSON.stringify({
    expected: 145,
    actual: tocflA0Entries.length,
    missingA0Meanings,
  })}`);
}

const completePinyinCount = vocabulary.filter(entry => entry.pinyin && !entry.needsParser?.includes("some variant pinyin")).length;
const englishCount = vocabulary.filter(entry => entry.english).length;
const unresolvedPinyinCount = vocabulary.filter(entry => !entry.pinyin).length;
const partialPinyinCount = vocabulary.filter(entry => entry.needsParser?.includes("some variant pinyin")).length;

const outputDirectory = dirname(resolve(outputPath));
const tocflDirectory = join(outputDirectory, "tocfl");
mkdirSync(tocflDirectory, { recursive: true });
const levelEntries = Object.fromEntries(
  Object.entries(levelMapping).map(([tocflLevel, cefr]) => [cefr, vocabulary.filter((entry) => entry.tocflLevel === Number(tocflLevel))]),
);

for (const [cefr, entries] of Object.entries(levelEntries)) {
  writeFileSync(
    join(tocflDirectory, `${cefr.toLowerCase()}.js`),
    `// Generated from the supplied TOCFL course and Hanzi Dict assets. Do not edit by hand.\nexport const tocfl${cefr}Vocabulary = ${JSON.stringify(entries, null, 2)};\n`,
  );
}

writeFileSync(
  join(tocflDirectory, "index.js"),
  `// Central TOCFL vocabulary loader. Entry data is preserved from the extracted dataset.\n`
    + Object.keys(levelEntries).map((cefr) => `import { tocfl${cefr}Vocabulary } from "./${cefr.toLowerCase()}.js";`).join("\n")
    + `\n\nexport const tocflVocabularyByLevel = Object.freeze({\n`
    + Object.keys(levelEntries).map((cefr) => `  ${cefr}: tocfl${cefr}Vocabulary,`).join("\n")
    + `\n});\n\nexport const tocflVocabulary = Object.freeze([\n`
    + Object.keys(levelEntries).map((cefr) => `  ...tocfl${cefr}Vocabulary,`).join("\n")
    + `\n]);\n\nexport const tocflVocabularyStats = {\n  courseCounts: {\n`
    + Object.entries(levelMapping).map(([tocflLevel, cefr]) => `    "TOCFL-${tocflLevel}": tocfl${cefr}Vocabulary.length,`).join("\n")
    + `\n  },\n  total: tocflVocabulary.length,\n  completePinyinCount: tocflVocabulary.filter((entry) => entry.pinyin && !entry.needsParser?.includes("some variant pinyin")).length,\n  partialPinyinCount: tocflVocabulary.filter((entry) => entry.needsParser?.includes("some variant pinyin")).length,\n  unresolvedPinyinCount: tocflVocabulary.filter((entry) => !entry.pinyin).length,\n  englishCount: tocflVocabulary.filter((entry) => entry.english).length,\n  needsEnglishParserCount: tocflVocabulary.filter((entry) => !entry.english).length,\n};\n\nexport const tocflCourseFormat = "AES-128-CTR; zero IV; key is repeated course name truncated to 16 UTF-8 bytes";\n`,
);

writeFileSync(
  resolve(outputPath),
  `// Compatibility export for existing consumers. Dataset is split under ./tocfl/.\nexport { tocflVocabulary, tocflVocabularyByLevel, tocflVocabularyStats, tocflCourseFormat } from "./tocfl/index.js";\n`,
);

console.log(JSON.stringify({
  courseCounts,
  total: vocabulary.length,
  completePinyinCount,
  partialPinyinCount,
  unresolvedPinyinCount,
  englishCount,
  needsEnglishParserCount: vocabulary.length - englishCount,
  samples: vocabulary.slice(0, 8).map(({ hanzi, pinyin, english, cefr, source }) => ({ hanzi, pinyin, english, cefr, source })),
}, null, 2));
