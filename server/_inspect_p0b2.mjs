import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });
for (const [w, h, label] of [[1024, 768, "1024x768"], [390, 844, "390x844"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(8000);

  const data = await page.evaluate(() => {
    const errorEl = document.querySelector("#camera-error");
    const video = document.querySelector("#camera");
    
    // Check z-index stacking
    const errorRect = errorEl.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    
    // Check if elements are stacked
    const elementsAtCenter = [];
    for (let y = window.innerHeight/2 - 10; y <= window.innerHeight/2 + 10; y += 5) {
      for (let x = window.innerWidth/2 - 10; x <= window.innerWidth/2 + 10; x += 5) {
        const el = document.elementFromPoint(x, y);
        if (el) elementsAtCenter.push(`${el.tagName}#${el.id || ''}.${el.className}`);
      }
    }
    
    // Check what the video is showing (srcObject)
    const srcObject = video.srcObject;
    const videoStyle = window.getComputedStyle(video);
    
    return {
      videoSrcObject: srcObject ? `${srcObject.constructor.name} (tracks: ${srcObject.getTracks().length})` : "null",
      videoDisplay: videoStyle.display,
      videoVisibility: videoStyle.visibility,
      videoZIndex: videoStyle.zIndex,
      videoZIndexNum: videoStyle.zIndex,
      errorZIndex: window.getComputedStyle(errorEl).zIndex,
      elementsAtCenter: [...new Set(elementsAtCenter)],
      errorChildren: [...errorEl.children].map(c => `${c.tagName}#${c.id || ''}.${c.className}`),
      // Check if there's a backdrop-filter on error
      errorBackdropFilter: window.getComputedStyle(errorEl).backdropFilter,
      errorBackground: window.getComputedStyle(errorEl).background,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  await ctx.close();
}
await browser.close();
