import pkg from "playwright";
const { chromium } = pkg;

const role = process.argv[2] || "mixed";
const fixId = process.argv[3] || "P0A";
const beforeAfter = process.argv[4] || "before";
const resName = process.argv[5] || "1024x768";

const [w, h] = resName.split("x").map(Number);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ 
  viewport: { width: w, height: h },
  deviceScaleFactor: w <= 390 ? 2 : 1,
});
const page = await ctx.newPage();
await page.goto(`http://localhost:8787/?role=${role}&splash=0&_t=` + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const dir = `../screenshots/levy-2026-08-21/${beforeAfter}/${resName}`;
await page.screenshot({ path: `${dir}/${resName}_${fixId}_${beforeAfter}.png`, fullPage: true });
console.log(`Saved: ${dir}/${resName}_${fixId}_${beforeAfter}.png`);

// Test assertions
const bottomBar = await page.$(".bottom-bar");
const rect = await bottomBar?.boundingBox();
const shutterBtn = await page.$("#btn-shutter");
const shutterRect = await shutterBtn?.boundingBox();

console.log("Bottom-bar:", JSON.stringify(rect));
console.log("Shutter-btn:", JSON.stringify(shutterRect));

await browser.close();
