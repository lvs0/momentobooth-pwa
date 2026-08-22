import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });
for (const [w, h, label] of [[1024, 768, "1024x768"], [390, 844, "390x844"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(8000); // Wait for camera to fail and show error

  const data = await page.evaluate(() => {
    const errorEl = document.querySelector("#camera-error");
    if (!errorEl) return { found: false };
    const rect = errorEl.getBoundingClientRect();
    const computed = window.getComputedStyle(errorEl);
    const innerHTML = errorEl.innerHTML;
    const video = document.querySelector("#camera");
    const videoRect = video ? video.getBoundingClientRect() : null;
    const videoVisible = videoRect ? video.offsetWidth > 0 && video.offsetHeight > 0 : false;
    
    // Check center of screen
    const centerEl = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
    
    return {
      found: true,
      hidden: errorEl.classList.contains("hidden"),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      computed: {
        position: computed.position,
        inset: computed.inset,
        display: computed.display,
        zIndex: computed.zIndex,
        pointerEvents: computed.pointerEvents,
        justifyContent: computed.justifyContent,
        alignItems: computed.alignItems,
      },
      videoVisible: videoVisible,
      videoRect: videoRect,
      centerEl: centerEl ? `${centerEl.tagName}.${centerEl.className}` : null,
      innerHTMLLength: innerHTML.length,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
  await ctx.close();
}
await browser.close();
