import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });

for (const [w, h, label] of [[1024, 768, "1024x768"], [390, 844, "390x844"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const meta = document.querySelector(".filter-rail-meta");
    const ring = document.querySelector("#photo-filter-rail");
    if (!meta || !ring) return { found: false, meta: !!meta, ring: !!ring };
    const metaRect = meta.getBoundingClientRect();
    const ringRect = ring.getBoundingClientRect();
    const metaStyle = window.getComputedStyle(meta);
    const ringStyle = window.getComputedStyle(ring);
    
    return {
      found: true,
      metaStyle: { position: metaStyle.position, right: metaStyle.right, top: metaStyle.top },
      metaRect: { top: Math.round(metaRect.top), left: Math.round(metaRect.left), width: Math.round(metaRect.width), height: Math.round(metaRect.height), right: Math.round(metaRect.right), bottom: Math.round(metaRect.bottom) },
      ringRect: { top: Math.round(ringRect.top), left: Math.round(ringRect.left), width: Math.round(ringRect.width), height: Math.round(ringRect.height), right: Math.round(ringRect.right), bottom: Math.round(ringRect.bottom) },
      ringLeftCss: ringStyle.left,
      ringLeft: Math.round(ringRect.left),
      ringRight: Math.round(ringRect.right),
      ringVisibleLeft: ringRect.left >= 0,
      metaOverlapRing: metaRect.left < ringRect.right && metaRect.right > ringRect.left && metaRect.top < ringRect.bottom && metaRect.bottom > ringRect.top,
      metaOverflowRight: metaRect.right > window.innerWidth,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  await ctx.close();
}
await browser.close();
