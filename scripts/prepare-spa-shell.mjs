import { readFile, writeFile, rm } from "node:fs/promises";

// Sites invokes the Worker for direct client routes. Embed the current HTML
// shell without depending on an optional static-assets binding.
const html = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
const workerPath = new URL("../dist/server/index.js", import.meta.url);
const worker = await readFile(workerPath, "utf8");
const marker = JSON.stringify("__BD10_SPA_SHELL__");
if (worker.split(marker).length !== 2) throw new Error("Expected one SPA shell marker in built Worker.");
await writeFile(workerPath, worker.replace(marker, () => JSON.stringify(html)));
await rm(new URL("../dist/server/.dev.vars", import.meta.url), { force: true });
console.log("Client route fallback prepared with current Vite assets.");
