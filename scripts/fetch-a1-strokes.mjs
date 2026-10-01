import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const characters = JSON.parse(await fs.readFile(path.join(root, "src/data/a1StrokeCharacters.json"), "utf8"));
const outputDirectory = path.join(root, "public/assets/stroke/a1/chars");
const manifestPath = path.join(root, "public/assets/stroke/a1/manifest.json");
const reportPath = path.join(root, "public/assets/stroke/a1/download-report.json");
const version = "2.0.1";
const concurrency = 8;

await fs.mkdir(outputDirectory, { recursive: true });

async function fetchCharacter(character) {
  const filename = `${character}.json`;
  const outputPath = path.join(outputDirectory, filename);
  try {
    const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
    if (Array.isArray(existing.strokes) && Array.isArray(existing.medians) && existing.strokes.length) {
      return { character, ok: true, cached: true, strokeCount: existing.strokes.length, source: "local cache" };
    }
  } catch {}

  const encoded = encodeURIComponent(character);
  const urls = [
    `https://cdn.jsdelivr.net/npm/hanzi-writer-data@${version}/${encoded}.json`,
    `https://raw.githubusercontent.com/chanind/hanzi-writer-data/master/data/${encoded}.json`,
  ];
  let failure;
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "BD10-A1-Stroke-Builder/1.0" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json();
      if (!Array.isArray(payload.strokes) || !Array.isArray(payload.medians) || !payload.strokes.length) {
        throw new Error("Invalid Hanzi Writer payload");
      }
      await fs.writeFile(outputPath, JSON.stringify(payload), "utf8");
      return { character, ok: true, cached: false, strokeCount: payload.strokes.length, source: url };
    } catch (error) {
      failure = String(error);
    }
  }
  return { character, ok: false, error: failure };
}

const results = [];
for (let offset = 0; offset < characters.length; offset += concurrency) {
  const batch = characters.slice(offset, offset + concurrency);
  results.push(...await Promise.all(batch.map(fetchCharacter)));
  console.log(`A1 stroke download: ${Math.min(offset + concurrency, characters.length)}/${characters.length}`);
}

const lookup = new Map(results.map((result) => [result.character, result]));
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
manifest.generatedAt = new Date().toISOString();
manifest.downloadedCount = results.filter((result) => result.ok).length;
manifest.failedCount = results.filter((result) => !result.ok).length;
manifest.characters = manifest.characters.map((entry) => {
  const result = lookup.get(entry.char);
  return {
    ...entry,
    strokeCount: result?.strokeCount ?? null,
    status: result?.ok ? "ready" : "missing",
    source: result?.source ?? null,
    error: result?.error ?? null,
  };
});
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");

console.log(`DONE: ${manifest.downloadedCount}/${characters.length} characters ready.`);
if (manifest.failedCount) process.exitCode = 2;
