import { copyFile, mkdir, stat, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(import.meta.dirname, "..");
const packageRoot = join(projectRoot, "native", "hid-bridge");
const outputPath = join(packageRoot, "build", "relight-hid-bridge");
const runTests = process.argv.includes("--test");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The native HID helper must be built on Apple Silicon macOS");
}

if (runTests) {
  run("swift", ["test", "--package-path", packageRoot, "--arch", "arm64"]);
}

run("swift", ["build", "--package-path", packageRoot, "--configuration", "release", "--arch", "arm64"]);
const binPath = run("swift", [
  "build",
  "--package-path",
  packageRoot,
  "--configuration",
  "release",
  "--arch",
  "arm64",
  "--show-bin-path",
]).trim();
const builtPath = join(binPath, "relight-hid-bridge");
await mkdir(dirname(outputPath), { recursive: true });
await copyFile(builtPath, outputPath);
await chmod(outputPath, 0o755);

const info = run("file", [outputPath]);
if (!info.includes("Mach-O 64-bit executable arm64")) {
  throw new Error("Native HID helper is not a single-architecture arm64 Mach-O executable");
}

const buildInfo = run("xcrun", ["vtool", "-show-build", outputPath]);
if (!/platform\s+MACOS/i.test(buildInfo) || !/minos\s+13(?:\.0+)?\b/.test(buildInfo)) {
  throw new Error("Native HID helper does not declare a macOS 13.0 deployment target");
}

const dependencies = run("otool", ["-L", outputPath])
  .split("\n")
  .slice(1)
  .map((line) => line.trim().split(/\s+\(/)[0])
  .filter(Boolean);
for (const dependency of dependencies) {
  if (
    !dependency.startsWith("/System/Library/") &&
    !dependency.startsWith("/usr/lib/") &&
    !dependency.startsWith("@rpath/libswift")
  ) {
    throw new Error(`Native HID helper links a non-system dependency: ${dependency}`);
  }
}

const selfTest = run(outputPath, ["--self-test"]);
const result = JSON.parse(selfTest);
if (result.ok !== true || result.protocolVersion !== 1) {
  throw new Error("Native HID helper self-test failed");
}

const artifact = await stat(outputPath);
process.stdout.write(
  `${JSON.stringify({
    helper: outputPath,
    architecture: "arm64",
    minimumSystemVersion: "13.0",
    bytes: artifact.size,
    linkedLibraries: dependencies.length,
    selfTest: "PASS",
  })}\n`,
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, LANG: "en_US.UTF-8" },
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout).trim();
    throw new Error(`${command} failed${detail.length > 0 ? `: ${detail}` : ""}`);
  }
  return String(result.stdout);
}
