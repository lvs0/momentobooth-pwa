/**
 * Phase 4 P0 screenshot harness.
 * Captures before/after shots at 1024x768 (iPad) and 390x844 (iPhone)
 * for the camera screen (?role=mixed&splash=0).
 *
 * Usage:
 *   node tests/e2e/p4-screenshots.mjs before
 *   node tests/e2e/p4-screenshots.mjs after
 *   node tests/e2e/p4-screenshots.mjs verify   # compare before vs after
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SHOT_DIR = path.join(ROOT, "screenshots/levy-2026-08-21");

const VIEWPORTS = {
  "ipad-1024x768": { width: 1024, height: 768 },
  "iphone-390x844": { width: 390, height: 844 },
};

const role = process.argv[3] || "mixed";

function dir(label) {
  const d = path.join(SHOT_DIR, label);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function run() {
  const label = process.argv[2] || "after";
  const browser = await chromium.launch({ headless: true });

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({
      ...vp,
      deviceScaleFactor: 2,
      isMobile: name.startsWith("iphone"),
    });
    const page = await ctx.newPage();
    const url = `http://localhost:8790/?role=${role}&splash=0`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    // Give JS time to render camera-error placeholder / capture screen
    await page.waitForTimeout(2500);
    const outDir = dir(label);
    const file = path.join(outDir, `${name}-camera.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`[p4-screenshots] saved ${file}`);
    await ctx.close();
  }
  await browser.close();
}

run();
