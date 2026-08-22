import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });

const sizes = [[1024, 768, "1024x768"], [390, 844, "390x844"]];
for (const [w, h, label] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `screenshots/levy-2026-08-21/before/p0-cd/${label}.png`, fullPage: true });
  console.log(`Saved ${label}.png`);
  await ctx.close();
}
await browser.close();
