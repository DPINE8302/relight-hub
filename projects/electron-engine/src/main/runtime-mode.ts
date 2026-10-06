import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { app } from "electron";

export interface RuntimeMode {
  development: boolean;
  e2e: boolean;
  packageVerification: boolean;
  verificationSentinelPath: string | null;
}

async function validatedVerificationSentinel(candidate: string): Promise<string> {
  const path = resolve(candidate);
  const temporaryRoot = await realpath(tmpdir());
  const parent = await realpath(dirname(path));
  const canonicalPath = resolve(parent, basename(path));
  const child = relative(temporaryRoot, canonicalPath);
  const name = basename(path);
  if (
    parent !== temporaryRoot ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    extname(name) !== ".json" ||
    !name.startsWith("relight-package-verification-")
  ) {
    throw new Error("Package verification sentinel must be a direct, named JSON file in the system temporary directory");
  }
  return canonicalPath;
}

export async function detectRuntimeMode(argv = process.argv): Promise<RuntimeMode> {
  const development = !app.isPackaged;
  const e2e = development && (process.env.RELIGHT_E2E === "1" || argv.includes("--relight-e2e"));
  const verificationIndex = argv.indexOf("--relight-package-verify");
  if (verificationIndex === -1) {
    return { development, e2e, packageVerification: false, verificationSentinelPath: null };
  }
  if (!app.isPackaged) throw new Error("Package verification mode is only available in a packaged build");
  const candidate = argv[verificationIndex + 1];
  if (candidate === undefined) throw new Error("Package verification mode requires a sentinel path");
  return {
    development,
    e2e: false,
    packageVerification: true,
    verificationSentinelPath: await validatedVerificationSentinel(candidate),
  };
}
