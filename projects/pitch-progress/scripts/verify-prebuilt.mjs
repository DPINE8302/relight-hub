import { access, readFile, stat } from "node:fs/promises";

const projectId = "appgprj_6a683cfe4f60819182397795bf701090";
const requiredFiles = [
  "dist/server/index.js",
  "dist/.openai/hosting.json",
  "dist/client/.vite/manifest.json",
];

for (const path of requiredFiles) {
  await access(path);
  if ((await stat(path)).size === 0) {
    throw new Error(`Packaged build file is empty: ${path}`);
  }
}

const hosting = JSON.parse(
  await readFile("dist/.openai/hosting.json", "utf8"),
);

if (hosting.project_id !== projectId) {
  throw new Error("Packaged build targets a different Sites project.");
}

console.log("Validated the supplied prebuilt RE:LIGHT package unchanged.");
