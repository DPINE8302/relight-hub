import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(process.env.RELIGHT_SCREENSHOT_DIR ?? resolve(projectRoot, "test-results", "visuals"));
await mkdir(outputDirectory, { recursive: true });
const runRoot = mkdtempSync(join(tmpdir(), "relight-e2e-"));
const userData = join(runRoot, "user-data");
mkdirSync(userData, { recursive: true, mode: 0o700 });

const app = await electron.launch({
  args: [projectRoot, "--relight-e2e", "--relight-e2e-user-data", userData],
  cwd: projectRoot,
  env: {
    ...process.env,
    RELIGHT_E2E: "1",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
});

try {
  let operator;
  let audience;
  const deadline = Date.now() + 15_000;
  while ((!operator || !audience) && Date.now() < deadline) {
    for (const page of app.windows()) {
      if (page.isClosed()) continue;
      if (await page.locator('[data-testid="operator-root"]').count()) operator = page;
      if (await page.locator('[data-testid="audience-root"]').count()) audience = page;
    }
    if (!operator || !audience) await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!operator || !audience) throw new Error("Could not identify the operator and audience windows");

  await operator.getByTestId("engine-state").waitFor({ state: "visible" });
  await operator.screenshot({ path: resolve(outputDirectory, "operator-status.png") });

  await operator.getByTestId("open-presentation-demo").click();
  await operator.locator("video").waitFor({ state: "visible" });
  await operator.locator("video").evaluate(async (element) => {
    if (element.readyState < 2) await new Promise((done) => element.addEventListener("loadeddata", done, { once: true }));
    element.currentTime = 3;
    await new Promise((done) => element.addEventListener("seeked", done, { once: true }));
    element.pause();
  });
  await operator.waitForTimeout(350);
  await operator.screenshot({ path: resolve(outputDirectory, "operator-demo-video.png") });
  await operator.getByRole("button", { name: /Possibility/ }).click();
  await operator.screenshot({ path: resolve(outputDirectory, "operator-demo-text.png") });

  await operator.getByTestId("nav-setup").click();
  await operator.waitForTimeout(250);
  await operator.screenshot({ path: resolve(outputDirectory, "operator-setup.png") });

  await operator.getByTestId("mode-production").click();
  await operator.waitForTimeout(250);
  await operator.screenshot({ path: resolve(outputDirectory, "operator-production-setup.png") });
  await operator.getByTestId("mode-test").click();
  await operator.waitForTimeout(250);

  await operator.getByTestId("nav-test-flow").click();
  await operator.waitForTimeout(250);
  await operator.screenshot({ path: resolve(outputDirectory, "operator-test-flow.png") });
  // Static presentation captures work even when no microphone is configured.
  // Interactive recording is exercised by the separate Electron E2E flow.
} finally {
  await app.close();
  rmSync(runRoot, { recursive: true, force: true });
}

console.log(`Captured RE:Light visual QA screenshots in ${outputDirectory}`);
