import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [chtIndexPath, chtDataPath, enIndexPath, enDataPath, outputPath] = process.argv.slice(2);
if (!outputPath) {
  throw new Error("Usage: node scripts/extract-vocabulary-assets.mjs <cht.idx> <cht.dat> <en.idx> <en.dat> <output.js>");
}

function parseIndex(path) {
  const source = readFileSync(resolve(path));
  const records = new Map();
  let cursor = 11;
  while (cursor < source.length) {
    const keyLength = source[cursor++];
    if (!keyLength || cursor + keyLength + 6 > source.length) break;
    const hanzi = source.subarray(cursor, cursor + keyLength).toString("utf8");
    cursor += keyLength;
    const offset = source.readUInt32LE(cursor); cursor += 4;
    const length = source.readUInt16LE(cursor); cursor += 2;
    records.set(hanzi, { offset, length });
  }
  return records;
}

// The payload cipher restarts every 16 bytes. Inside each block, the first
// Hanzi UTF-8 bytes are the XOR key; later positions use the paired-even mask
// 04 04, 06 06, 08 08 ... 0e 0e.
function decodeRecord(hanzi, encoded) {
  const key = Buffer.from(hanzi, "utf8");
  return Buffer.from(encoded.map((byte, index) => {
    const localIndex = index % 16;
    const mask = localIndex < key.length
      ? key[localIndex]
      : (Math.floor((localIndex + 1) / 2) * 2) & 0xff;
    return byte ^ mask;
  }));
}

function readJsonRecord(index, data, hanzi) {
  const location = index.get(hanzi);
  if (!location) return null;
  const encoded = data.subarray(location.offset, location.offset + location.length);
  const decoded = decodeRecord(hanzi, encoded);
  try {
    return { ...location, payload: JSON.parse(decoded.toString("utf8")) };
  } catch {
    return null;
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(value => typeof value === "string" && value.trim()).map(value => value.trim()))];
}

function extractEnglishRecord(hanzi, record) {
  if (!record?.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) return null;
  for (const [pinyin, senses] of Object.entries(record.payload)) {
    if (!pinyin || !Array.isArray(senses)) continue;
    const meanings = uniqueStrings(senses.map(sense => Array.isArray(sense?.t) ? sense.t[1] : null));
    if (!meanings.length) continue;
    const examples = senses.flatMap(sense => Array.isArray(sense?.e) ? sense.e : []);
    const firstExample = examples.find(pair => Array.isArray(pair)
      && typeof pair[0] === "string"
      && typeof pair[1] === "string");
    return {
      hanzi,
      pinyin,
      english: meanings[0],
      definition: meanings.join("; "),
      partOfSpeech: uniqueStrings(senses.map(sense => sense?.k)).join(", ") || null,
      ...(firstExample ? { example: firstExample[0], exampleEnglish: firstExample[1] } : {}),
    };
  }
  return null;
}

const chtIndex = parseIndex(chtIndexPath);
const enIndex = parseIndex(enIndexPath);
const chtData = readFileSync(resolve(chtDataPath));
const enData = readFileSync(resolve(enDataPath));

// Language fields below always come from the asset payload. This list only
// chooses common single-character dictionary records for the learning UI.
const preferredCharacters = [...new Set([...
  "我你他她它們好是有在的了不人家媽爸父母兄弟姐妹朋友老師學生公司工作上班下班做休息早晚今天明天昨天起床吃飯睡覺水茶咖啡奶買賣錢多少這那哪裡誰什麼怎麼請謝再見對不起沒關係可以要想喜歡喝去來住看聽說讀寫學中文英文時間年月日星期點半前後左右上下中外內旁邊機台晶圓設備無塵室電梯樓梯辦公室餐廳商店市場夜市車站廁所男女人大小高低新舊熱冷甜辣酸苦開關進出走坐站給拿放問回答知道懂會能應該需要負責幫忙問題安全小心慢快一二三四五六七八九十百千萬"
])];

const selected = [];
for (const hanzi of preferredCharacters) {
  if (selected.length >= 120) break;
  if (!chtIndex.has(hanzi)) continue;
  const enRecord = readJsonRecord(enIndex, enData, hanzi);
  const entry = extractEnglishRecord(hanzi, enRecord);
  if (!entry) continue;
  selected.push({
    id: `asset-${selected.length + 1}`,
    ...entry,
    cefr: null,
    topic: "Common Words",
    source: "en-meanings .idx + .dat",
    offsets: { cht: chtIndex.get(hanzi).offset, en: enRecord.offset },
    recordLengths: { cht: chtIndex.get(hanzi).length, en: enRecord.length },
  });
}

if (selected.length < 100) {
  throw new Error(`Only ${selected.length} complete records decoded; expected at least 100.`);
}

writeFileSync(
  resolve(outputPath),
  `// Generated from the supplied Hanzi Dict asset pack. Do not edit by hand.\nexport const parsedVocabulary = ${JSON.stringify(selected, null, 2)};\nexport const parsedDictionaryEntryCount = ${chtIndex.size};\nexport const parsedPayloadFormat = "16-byte block-reset XOR JSON; English meaning is sense.t[1]";\n`,
);
console.log(`Parsed ${chtIndex.size} dictionary index records; exported ${selected.length} complete Hanzi + Pinyin + English records.`);
