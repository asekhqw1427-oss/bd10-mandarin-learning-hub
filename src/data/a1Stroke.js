const STROKE_BASE = "/assets/stroke/a1/";
// Hanzi Writer paths use a Cartesian (Y-up) coordinate system. The shared
// SVG renderer uses the browser's Y-down coordinate system, so normalize A1
// geometry at render time without changing its source paths or stroke order.
export const A1_STROKE_GEOMETRY_TRANSFORM = "translate(0 1024) scale(1 -1)";

let indexPromise;
const characterPromises = new Map();

function normaliseCharacterPayload(character, payload, entry) {
  if (!Array.isArray(payload?.strokes) || !Array.isArray(payload?.medians) || !payload.strokes.length) {
    throw new Error(`Invalid A1 stroke payload for ${character}.`);
  }

  return {
    ...entry,
    stroke_file: entry.file,
    path: `${STROKE_BASE}${entry.file}`,
    byteLength: 0,
    decoded: {
      character,
      strokeCount: payload.strokes.length,
      viewBox: "0 0 1024 1024",
      geometryTransform: A1_STROKE_GEOMETRY_TRANSFORM,
      strokes: payload.strokes.map((path, index) => ({
        index: index + 1,
        name: `Stroke ${index + 1}`,
        path,
        median: Array.isArray(payload.medians[index]) ? payload.medians[index] : null,
        commands: [],
      })),
    },
  };
}

export function loadA1StrokeIndex() {
  if (!indexPromise) {
    indexPromise = fetch(`${STROKE_BASE}manifest.json`).then(async (response) => {
      if (!response.ok) throw new Error(`A1 stroke manifest unavailable (${response.status})`);
      const manifest = await response.json();
      if (!Array.isArray(manifest.characters)) throw new Error("Invalid A1 stroke manifest.");
      return {
        manifest,
        byCharacter: new Map(manifest.characters.map((entry) => [entry.char, entry])),
      };
    });
  }
  return indexPromise;
}

export function loadA1StrokeCharacter(entry) {
  if (!entry?.char || !entry?.file || entry.status === "missing") return Promise.resolve(null);
  if (!characterPromises.has(entry.char)) {
    const filename = `${encodeURIComponent(entry.char)}.json`;
    characterPromises.set(entry.char, fetch(`${STROKE_BASE}chars/${filename}`).then(async (response) => {
      if (!response.ok) throw new Error(`A1 stroke asset unavailable (${response.status})`);
      const payload = await response.json();
      return normaliseCharacterPayload(entry.char, payload, entry);
    }));
  }
  return characterPromises.get(entry.char);
}
