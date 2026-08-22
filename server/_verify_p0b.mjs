import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });

const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForTimeout(8000);

const data = await page.evaluate(() => {
  const errorEl = document.querySelector("#camera-error");
  const computed = window.getComputedStyle(errorEl);
  return {
    hidden: errorEl.classList.contains("hidden"),
    backdropFilter: computed.backdropFilter,
    background: computed.background,
    display: computed.display,
    justifyContent: computed.justifyContent,
    alignItems: computed.alignItems,
    hasCameraIcon: errorEl.querySelector(".camera-error-icon")?.textContent || null,
    titleText: errorEl.querySelector(".camera-error-title")?.textContent || null,
    btnText: errorEl.querySelector("#btn-retry-camera")?.textContent || null,
  };
});
console.log(JSON.stringify(data, null, 2));
await ctx.close();
await browser.close();
