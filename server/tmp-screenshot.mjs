import { chromium } from "@playwright/test";
import fs from "fs";

const widths = [1024, 390];
const heights = [768, 844];
const phase = process.argv[2] || "before";
const url = "http://localhost:8787/?role=mixed&splash=0";

for (let i = 0; i < widths.length; i++) {
  const viewport = { width: widths[i], height: heights[i] };
  const suffix = `${widths[i]}x${heights[i]}`;
  
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ 
    viewport, 
    deviceScaleFactor: widths[i] === 390 ? 3 : 2,
    isMobile: widths[i] === 390,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  const outDir = `screenshots/levy-2026-08-21/${phase}/${suffix}`;
  await page.screenshot({ path: `${outDir}/camera.png`, fullPage: true });
  
  // Also capture specific regions for analysis
  const bb = await page.locator('.bottom-bar').boundingBox();
  if (bb) {
    await page.screenshot({ path: `${outDir}/bottom-bar.png`, clip: { x: Math.max(0, bb.x - 5), y: Math.max(0, bb.y - 5), width: bb.width + 10, height: bb.height + 10 } });
  }
  
  console.log(`${phase}/${suffix}: saved. bottom-bar:`, JSON.stringify(bb));
  await browser.close();
}
