import { execFileSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

// These are the only non-code files that may be committed from this nested
// repository. Additions require an intentional review of this manifest.
const approvedFiles = new Set([
  ".gitignore",
  ".npmrc",
  "README.md",
  "docs/AUDIO_EFFECTS.md",
  "docs/EXHIBITION_SETUP.md",
  "docs/EXPERIENCE_CONFIG.md",
  "docs/HARDWARE.md",
  "docs/OPERATOR_CHEAT_SHEET.md",
  "docs/START_HERE.md",
  "docs/TROUBLESHOOTING.md",
  "docs/design/DESIGN_SYSTEM.md",
  "docs/design/audience-record-concept.png",
  "docs/design/operator-status-concept.png",
  "electron.vite.config.ts",
  "eslint.config.js",
  "native/hid-bridge/.gitignore",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "resources/default-content/experience.json",
  "resources/default-content/media/.keep",
  "resources/fonts/line-seed-sans-th/LINESeedSansTH-Bold.woff2",
  "resources/fonts/line-seed-sans-th/LINESeedSansTH-Regular.woff2",
  "resources/fonts/line-seed-sans-th/OFL-1.1.txt",
  "resources/notices/CONTENT_BOUNDARY.txt",
  "scripts/build-hid-helper.mjs",
  "scripts/capture-visuals.mjs",
  "scripts/verify-package.mjs",
  "scripts/verify-source-boundary.mjs",
  "tsconfig.json",
  "vitest.config.ts",
]);

// The native allowlist is deliberately limited to the public-IOKit helper's
// Swift package. Native binaries, build output, arbitrary resources, and code
// placed elsewhere remain outside the source boundary.
const approvedCodeRoots = ["src/", "tests/", "native/hid-bridge/"];
const approvedCodeExtensions = new Set([".css", ".html", ".swift", ".ts", ".tsx"]);
const generatedRoots = ["native/hid-bridge/.build/"];
const protectedExtensions = new Set([
  ".7z", ".ai", ".doc", ".docx", ".gif", ".ico", ".jpeg", ".jpg", ".key", ".m4a",
  ".mov", ".mp3", ".mp4", ".numbers", ".odt", ".pages", ".pdf", ".png", ".psd", ".rar",
  ".rtf", ".svg", ".tar", ".tgz", ".wav", ".webp", ".zip",
]);
const protectedNames = [
  ".ds_store",
  "flowstory",
  "flowtech",
  "meet-01",
  "meeting-notes",
  "private-notes",
  "scene01.mp4",
  "teacher advice",
];

function repositoryCandidates() {
  const tracked = new Set(
    execFileSync("git", ["ls-files", "--cached", "-z"], { cwd: root, encoding: "utf8" })
      .split("\0")
      .filter(Boolean),
  );
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter(Boolean)
    // SwiftPM output is local build state. Ignore it only while untracked; a
    // staged artifact remains a candidate and fails the manifest below.
    .filter((path) => tracked.has(path) || !generatedRoots.some((prefix) => path.startsWith(prefix)))
    .sort();
}

function isApprovedCode(path) {
  return approvedCodeRoots.some((prefix) => path.startsWith(prefix)) &&
    approvedCodeExtensions.has(extname(path).toLowerCase());
}

const issues = [];
for (const path of repositoryCandidates()) {
  const lower = path.toLowerCase();
  const extension = extname(lower);
  const explicitlyApproved = approvedFiles.has(path);

  if (protectedNames.some((name) => lower.includes(name))) {
    issues.push(`${path}: matches a protected archive/private-data name`);
    continue;
  }
  if (protectedExtensions.has(extension) && !explicitlyApproved) {
    issues.push(`${path}: protected document/media type is not explicitly approved`);
    continue;
  }
  if (!explicitlyApproved && !isApprovedCode(path)) {
    issues.push(`${path}: path or extension is outside the repository allowlist`);
  }
}

if (issues.length > 0) {
  throw new Error(`Source boundary verification failed:\n${issues.join("\n")}`);
}

console.log("Verified nested repository boundary: every repository candidate is on the approved source/resource manifest.");
