import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:8787/?role=mixed&splash=0", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const data = await page.evaluate(() => {
  const bb = document.querySelector(".bottom-bar");
  const sb = document.getElementById("btn-shutter");
  const gif = document.getElementById("shutter-hint-gif");
  
  const getRect = (el) => el ? {
    display: getComputedStyle(el).display,
    position: getComputedStyle(el).position,
    left: getComputedStyle(el).left,
    top: getComputedStyle(el).top,
    right: getComputedStyle(el).right,
    width: getComputedStyle(el).width,
    height: getComputedStyle(el).height,
    borderRadius: getComputedStyle(el).borderRadius,
    zIndex: getComputedStyle(el).zIndex,
    bottom: getComputedStyle(el).bottom,
    transform: getComputedStyle(el).transform,
    ...el.getBoundingClientRect()
  } : null;

  return {
    bottomBar: getRect(bb),
    shutterBtn: getRect(sb),
    shutterHintGif: getRect(gif),
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
