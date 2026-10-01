import { decodeHanziPayload, extractHanziPayload } from "../utils/hanziStrokeParser";

const STROKE_BASE = "/assets/stroke/a0/";

let indexPromise;
const shardPromises = new Map();

export function getHanziCharacters(value = "") {
  return Array.from(value).filter((character) => /\p{Script=Han}/u.test(character));
}

export function loadA0StrokeIndex() {
  if (!indexPromise) {
    indexPromise = Promise.all([
      fetch(`${STROKE_BASE}character_to_stroke_file.json`).then((response) => {
        if (!response.ok) throw new Error(`Stroke mapping unavailable (${response.status})`);
        return response.json();
      }),
      fetch(`${STROKE_BASE}A0_STROKE_MANIFEST.json`).then((response) => {
        if (!response.ok) throw new Error(`Stroke manifest unavailable (${response.status})`);
        return response.json();
      }),
    ]).then(([mapping, manifest]) => ({
      manifest,
      byCharacter: new Map(mapping.map((entry) => [entry.character, entry])),
    }));
  }
  return indexPromise;
}

export function loadA0StrokeShard(entry) {
  if (!entry?.stroke_file) return Promise.resolve(null);
  if (!shardPromises.has(entry.stroke_file)) {
    shardPromises.set(entry.stroke_file, fetch(`${STROKE_BASE}${entry.stroke_file}`).then(async (response) => {
      if (!response.ok) throw new Error(`Stroke shard unavailable (${response.status})`);
      return response.arrayBuffer();
    }));
  }
  return shardPromises.get(entry.stroke_file).then((bytes) => {
    const payload = extractHanziPayload(bytes, Number.parseInt(entry.unicode?.slice(2) || "", 16));
    if (!payload) throw new Error(`No .hanzi record found for ${entry.character || entry.unicode}.`);
    return {
      ...entry,
      byteLength: bytes.byteLength,
      path: `${STROKE_BASE}${entry.stroke_file}`,
      decoded: decodeHanziPayload(payload, entry.character),
    };
  });
}
