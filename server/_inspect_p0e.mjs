import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });

const sizes = [[1024, 768, "1024x768"], [390, 844, "390x844"]];
for (const [w, h, label] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  const result = await page.evaluate(() => {
    const btn = document.querySelector("#tablet-qr-open");
    if (!btn) return { found: false };
    const rect = btn.getBoundingClientRect();
    const style = getComputedStyle(btn);
    const span = btn.querySelector("span");
    const spanText = span ? span.textContent.trim() : null;
    const spanRect = span ? span.getBoundingClientRect() : null;
    const lines = span ? span.textContent.split(/\s+/).length : 0;
    return {
      found: true,
      text: spanText,
      buttonRect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height), right: Math.round(rect.right) },
      spanRect: spanRect ? { top: Math.round(spanRect.top), left: Math.round(spanRect.left), width: Math.round(spanRect.width), height: Math.round(spanRect.height), right: Math.round(spanRect.right) } : null,
      fontSize: style.fontSize,
      whiteSpace: style.whiteSpace,
      gridTemplateColumns: style.gridTemplateColumns
    };
  });
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(result, null, 2));
  await ctx.close();
}
await browser.close();
