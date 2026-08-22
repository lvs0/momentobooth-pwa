import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:8787/?role=mixed&splash=0", { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const bb = document.querySelector('.bottom-bar');
  const cs = getComputedStyle(bb);
  return JSON.stringify({
    bounding: bb.getBoundingClientRect(),
    computed: {
      display: cs.display,
      flexDirection: cs.flexDirection,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      position: cs.position,
      left: cs.left,
      right: cs.right,
      bottom: cs.bottom,
      top: cs.top,
      width: cs.width,
      height: cs.height,
      padding: cs.padding,
      gap: cs.gap,
      transform: cs.transform,
      zIndex: cs.zIndex,
      background: cs.background,
      borderRadius: cs.borderRadius,
      backdropFilter: cs.backdropFilter,
    },
  }, null, 2);
});
console.log(result);

// Also get each child's bounding box
const children = await page.evaluate(() => {
  const bb = document.querySelector('.bottom-bar');
  return Array.from(bb.children).map(el => ({
    id: el.id,
    tag: el.tagName,
    bounding: el.getBoundingClientRect(),
    className: el.className,
  }));
});
console.log('CHILDREN:', JSON.stringify(children, null, 2));

await browser.close();
