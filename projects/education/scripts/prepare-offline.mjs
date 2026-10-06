import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
const hash = createHash("sha256");
async function visit(path) {
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await visit(file);
    else if (/\.(tsx?|css)$/.test(file)) hash.update(await readFile(file));
  }
}
await visit("app");
hash.update(await readFile("public/games/puff-world-inside/offline-assets.json"));
const path = "public/sw.js";
const source = await readFile(path, "utf8");
// Include service-worker behavior itself without the version string.
hash.update(source.replace(/const VERSION = "[^"]+";/, ""));
await writeFile(path, source.replace(/const VERSION = "[^"]+";/, `const VERSION = "relight-offline-${hash.digest("hex").slice(0, 12)}";`));
console.log("Offline cache version prepared from app source.");
