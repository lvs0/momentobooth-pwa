import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const data = await page.evaluate(() => {
  const bb = document.querySelector(".bottom-bar");
  const computed = getComputedStyle(bb);
  return {
    position: computed.position,
    left: computed.left,
    right: computed.right,
    top: computed.top,
    bottom: computed.bottom,
    transform: computed.transform,
    width: computed.width,
    height: computed.height,
    borderRadius: computed.borderRadius,
    zIndex: computed.zIndex,
    cssText: bb.style.cssText,
    className: bb.className,
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
