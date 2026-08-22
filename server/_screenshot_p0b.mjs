import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });

for (const [w, h, label] of [[1024, 768, "1024x768"], [390, 844, "390x844"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(8000);
  
  // Full page screenshot
  await page.screenshot({ path: `screenshots/levy-2026-08-21/after/${label}-p0b-camera-error.png`, fullPage: true });
  
  // Check computed backdrop-filter
  const computed = await page.evaluate(() => {
    const el = document.querySelector("#camera-error");
    const style = window.getComputedStyle(el);
    return {
      backdropFilter: style.backdropFilter,
      background: style.background,
      display: style.display,
      justifyContent: style.justifyContent,
      alignItems: style.alignItems,
    };
  });
  console.log(`${label}: ${JSON.stringify(computed)}`);
  await ctx.close();
}
await browser.close();
