import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, extname } from "node:path";
import ts from "typescript";

// Load small server modules without a build or a DB connection. Production
// imports remain untouched; Node's own crypto, Request and Response are used.
export async function typescriptUrl(file) {
  const path = file instanceof URL ? fileURLToPath(file) : file;
  let code = ts.transpileModule(await readFile(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const imports = [...code.matchAll(/\bfrom\s+(["'])(\.{1,2}\/[^"']+)\1/g)];
  for (const match of imports) {
    const target = resolve(dirname(path), match[2] + (extname(match[2]) ? "" : ".ts"));
    const url = extname(target) === ".ts" ? await typescriptUrl(target) : pathToFileURL(target).href;
    code = code.replace(match[0], `from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
export async function loadTypescript(file) { return import(await typescriptUrl(file)); }
