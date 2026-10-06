import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listPackage } from "@electron/asar";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dmgPath = resolve(
  process.env.RELIGHT_DMG_PATH ?? join(projectRoot, "release", "RELight-Engine-1.0.0-arm64.dmg"),
);
const mountPoint = mkdtempSync(join(tmpdir(), "relight-dmg-"));
const runRoot = mkdtempSync(join(tmpdir(), "relight-package-run-"));
const copiedAppPath = join(runRoot, "RELight.app");
const isolatedUserData = join(runRoot, "user-data");
const launchSentinel = join(tmpdir(), `relight-package-verification-${process.pid}.json`);

const forbiddenNames = [
  "meet-01.txt",
  "scene01.mp4",
  "flowstory.png",
  "flowtech.png",
  "teacher advice",
];
const forbiddenExtensions = new Set([".pdf", ".zip", ".ai"]);
const exactExtraResources = new Set([
  "default-content/experience.json",
  "default-content/media/.keep",
  "fonts/line-seed-sans-th/LINESeedSansTH-Regular.woff2",
  "fonts/line-seed-sans-th/LINESeedSansTH-Bold.woff2",
  "fonts/line-seed-sans-th/OFL-1.1.txt",
  "notices/CONTENT_BOUNDARY.txt",
]);
const allowedProductionPackages = new Set(["electron-log", "react", "react-dom", "scheduler", "zod"]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    ...options,
  });
}

function walk(root) {
  const entries = [];
  for (const name of readdirSync(root)) {
    const fullPath = join(root, name);
    const relative = fullPath.slice(root.length + 1);
    entries.push(relative);
    if (statSync(fullPath).isDirectory()) {
      for (const nested of walk(fullPath)) entries.push(join(relative, nested));
    }
  }
  return entries;
}

function files(root) {
  return walk(root).filter((entry) => statSync(join(root, entry)).isFile());
}

function assertSafePath(candidate) {
  const normalized = candidate.toLowerCase();
  const extension = normalized.slice(normalized.lastIndexOf("."));
  if (forbiddenExtensions.has(extension)) {
    throw new Error(`Forbidden archive extension in package: ${candidate}`);
  }
  if (forbiddenNames.some((name) => normalized.includes(name))) {
    throw new Error(`Forbidden parent-archive asset in package: ${candidate}`);
  }
}

function assertAsarPath(candidate) {
  assertSafePath(candidate);
  const normalized = candidate.replace(/^\/+/, "");
  if (normalized === "package.json" || normalized === "out" || normalized.startsWith("out/")) return;
  if (normalized === "node_modules") return;
  if (normalized.startsWith("node_modules/")) {
    const segments = normalized.split("/");
    const packageName = segments[1]?.startsWith("@") ? `${segments[1]}/${segments[2] ?? ""}` : segments[1];
    if (packageName && allowedProductionPackages.has(packageName)) return;
  }
  throw new Error(`File outside the packaged ASAR allowlist: ${candidate}`);
}

function plist(appPath, key) {
  return run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", join(appPath, "Contents", "Info.plist")], { capture: true }).trim();
}

function assertAdHocSignature(path, label) {
  run("codesign", ["--verify", "--strict", "--verbose=2", path]);
  const signature = spawnSync("codesign", ["-dv", "--verbose=4", path], { encoding: "utf8" });
  if (!`${signature.stdout}${signature.stderr}`.includes("Signature=adhoc")) {
    throw new Error(`${label} is not ad-hoc signed`);
  }
}

function assertArm64Only(path, label) {
  const architectures = run("/usr/bin/lipo", ["-archs", path], { capture: true }).trim().split(/\s+/);
  if (architectures.length !== 1 || architectures[0] !== "arm64") {
    throw new Error(`${label} must be arm64 only; found ${architectures.join(", ")}`);
  }
}

function assertNativeHelper(appPath) {
  const helperPath = join(appPath, "Contents", "Library", "Helpers", "relight-hid-bridge");
  if (!existsSync(helperPath)) {
    throw new Error("Native HID helper is missing from Contents/Library/Helpers/relight-hid-bridge");
  }
  if ((statSync(helperPath).mode & 0o111) === 0) {
    throw new Error("Native HID helper is not executable");
  }

  assertAdHocSignature(helperPath, "Native HID helper");
  assertArm64Only(helperPath, "Native HID helper");

  const buildInfo = run("/usr/bin/vtool", ["-show-build", helperPath], { capture: true });
  const minimumVersion = buildInfo.match(/\bminos\s+([0-9.]+)/)?.[1];
  if (minimumVersion !== "13.0") {
    throw new Error(`Native HID helper minimum macOS version must be 13.0; found ${minimumVersion ?? "unknown"}`);
  }

  const dependencies = run("/usr/bin/otool", ["-L", helperPath], { capture: true })
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+\(/, 1)[0])
    .filter(Boolean);
  const nonSystemDependencies = dependencies.filter(
    (dependency) => !dependency.startsWith("/System/Library/") && !dependency.startsWith("/usr/lib/"),
  );
  if (nonSystemDependencies.length > 0) {
    throw new Error(`Native HID helper links non-system libraries: ${nonSystemDependencies.join(", ")}`);
  }
}

function waitForSentinel(timeoutMs) {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(launchSentinel)) return;
    Atomics.wait(pause, 0, 0, 250);
  }
  throw new Error("Packaged app did not complete its offline placeholder verification cycle");
}

if (!existsSync(dmgPath)) {
  throw new Error(`DMG not found: ${dmgPath}. Run npm run package:mac:local first.`);
}

let launchedChild = null;
try {
  run("hdiutil", ["verify", dmgPath]);
  run("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountPoint]);

  const mountedAppPath = join(mountPoint, "RELight.app");
  if (!existsSync(mountedAppPath)) throw new Error(`RELight.app is missing from ${basename(dmgPath)}`);

  run("/usr/bin/ditto", [mountedAppPath, copiedAppPath]);
  mkdirSync(isolatedUserData, { recursive: true, mode: 0o700 });

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", copiedAppPath]);
  const signature = run("codesign", ["-dv", "--verbose=4", copiedAppPath], {
    capture: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const signatureDetails = `${signature ?? ""}`;
  if (!signatureDetails.includes("Signature=adhoc")) {
    const fallback = spawnSync("codesign", ["-dv", "--verbose=4", copiedAppPath], { encoding: "utf8" });
    if (!`${fallback.stdout}${fallback.stderr}`.includes("Signature=adhoc")) {
      throw new Error("Application is not ad-hoc signed as required for the local Test package");
    }
  }

  if (plist(copiedAppPath, "CFBundleIdentifier") !== "com.relight.engine") throw new Error("Packaged bundle identifier is incorrect");
  if (plist(copiedAppPath, "CFBundleDisplayName") !== "RE:Light Engine") throw new Error("Packaged Finder display name is incorrect");
  if (plist(copiedAppPath, "LSMinimumSystemVersion") !== "13.0") throw new Error("Packaged minimum macOS version is incorrect");
  const expectedPurpose = "RE:Light uses the microphone to temporarily record the participant's response as part of the interactive experience.";
  if (plist(copiedAppPath, "NSMicrophoneUsageDescription") !== expectedPurpose) throw new Error("Packaged microphone purpose string is incorrect");
  const executableName = plist(copiedAppPath, "CFBundleExecutable");
  const executablePath = join(copiedAppPath, "Contents", "MacOS", executableName);
  assertArm64Only(executablePath, "Packaged executable");
  assertNativeHelper(copiedAppPath);

  const resourcesRoot = join(copiedAppPath, "Contents", "Resources");
  for (const entry of walk(resourcesRoot)) assertSafePath(entry);

  const asarPath = join(resourcesRoot, "app.asar");
  const packagedEntries = listPackage(asarPath);
  for (const entry of packagedEntries) assertAsarPath(entry);
  if (!packagedEntries.some((entry) => /^\/?out\/renderer\/assets\/Scene01_Draft1_480p_v5-[A-Za-z0-9_-]+\.mp4$/.test(entry))) {
    throw new Error("Selected Scene 01 Draft 1 presentation video is missing from the packaged app");
  }

  const requiredResources = [
    "default-content/experience.json",
    "default-content/media/.keep",
    "fonts/line-seed-sans-th/LINESeedSansTH-Regular.woff2",
    "fonts/line-seed-sans-th/LINESeedSansTH-Bold.woff2",
    "fonts/line-seed-sans-th/OFL-1.1.txt",
    "notices/CONTENT_BOUNDARY.txt",
  ];
  for (const relative of requiredResources) {
    if (!existsSync(join(resourcesRoot, relative))) {
      throw new Error(`Required packaged resource is missing: ${relative}`);
    }
  }
  for (const relative of files(resourcesRoot)) {
    if (/^(?:default-content|fonts|notices)\//.test(relative) && !exactExtraResources.has(relative)) {
      throw new Error(`Unexpected file in explicit extra-resource allowlist: ${relative}`);
    }
  }

  rmSync(launchSentinel, { force: true });
  launchedChild = spawn(executablePath, [
    "--relight-package-verify",
    launchSentinel,
    "--relight-verification-user-data",
    isolatedUserData,
  ], {
    cwd: runRoot,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
    stdio: "inherit",
  });
  try {
    waitForSentinel(60_000);
  } catch (error) {
    const packagedLog = join(isolatedUserData, "logs", "relight.log");
    if (existsSync(packagedLog)) {
      process.stderr.write(`\nPackaged runtime log:\n${readFileSync(packagedLog, "utf8")}\n`);
    }
    throw error;
  }
  const result = JSON.parse(readFileSync(launchSentinel, "utf8"));
  if (
    result.ok !== true ||
    result.offline !== true ||
    result.placeholderCycle !== true ||
    result.audienceReady !== true ||
    result.bundleId !== "com.relight.engine" ||
    result.microphonePurposeStringPresent !== true ||
    result.microphonePermissionStatus !== "granted" ||
    result.mediaDevices?.audioInputCount <= 0 ||
    result.mediaDevices?.audioOutputCount <= 0 ||
    result.mediaDevices?.namedAudioInputAvailable !== true ||
    result.networkAudit?.remoteRequestsAttempted !== 0 ||
    result.networkAudit?.remoteRequestsAllowed !== 0
  ) {
    throw new Error(`Packaged verification reported failure: ${JSON.stringify(result)}`);
  }
  launchedChild.kill("SIGTERM");
  launchedChild = null;
  console.log(`Verified ${basename(dmgPath)}: copied app and native HID helper are arm64/ad-hoc signed with a macOS 13 helper deployment target and system-only dylinks; exact allowlists, packaged microphone permission, audience-owned real media-device enumeration, audience readiness, zero remote-request attempts, and renderer-driven offline cycle also passed.`);
} finally {
  launchedChild?.kill("SIGTERM");
  rmSync(launchSentinel, { force: true });
  spawnSync("hdiutil", ["detach", mountPoint, "-force"], { encoding: "utf8" });
  rmSync(mountPoint, { recursive: true, force: true });
  rmSync(runRoot, { recursive: true, force: true });
}
