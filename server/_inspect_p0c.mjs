import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });

for (const [w, h, label] of [[1024, 768, "1024x768"], [390, 844, "390x844"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const meta = document.querySelector("#photo-filter-rail .filter-rail-meta");
    const ring = document.querySelector("#photo-filter-rail");
    if (!meta) return { found: false };
    const metaRect = meta.getBoundingClientRect();
    const ringRect = ring.getBoundingClientRect();
    
    return {
      found: true,
      metaRect: { top: metaRect.top, left: metaRect.left, width: metaRect.width, height: metaRect.height, right: metaRect.right, bottom: metaRect.bottom },
      ringRect: { top: ringRect.top, left: ringRect.left, width: ringRect.width, height: ringRect.height, right: ringRect.right, bottom: ringRect.bottom },
      metaStyle: {
        position: window.getComputedStyle(meta).position,
        left: window.getComputedStyle(meta).left,
        bottom: window.getComputedStyle(meta).bottom,
      },
      metaOverlapRing: metaRect.left < ringRect.right && metaRect.right > ringRect.left && metaRect.top < ringRect.bottom && metaRect.bottom > ringRect.top,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  await ctx.close();
}
await browser.close();
