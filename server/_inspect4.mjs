import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const data = await page.evaluate(() => {
  // Check all .bottom-bar rules
  const allRules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        if (rule.selectorText && rule.selectorText.includes("bottom-bar")) {
          allRules.push(`${rule.selectorText} { ${rule.style.cssText} }`);
        }
      }
    } catch(e) {}
  }
  
  const bb = document.querySelector(".bottom-bar");
  const computed = getComputedStyle(bb);
  return {
    allBottomBarRules: allRules,
    computedBottom: computed.bottom,
    computedLeft: computed.left,
    computedRight: computed.right,
    computedTop: computed.top,
    computedTransform: computed.transform,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
