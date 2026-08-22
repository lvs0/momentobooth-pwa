import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForTimeout(6000);

const data = await page.evaluate(() => {
  const meta = document.querySelector("#photo-filter-rail .filter-rail-meta");
  const cs = window.getComputedStyle(meta);
  
  // Walk up parents to find transform contexts
  const parents = [];
  let el = meta.parentElement;
  while (el && el !== document.body) {
    const c = window.getComputedStyle(el);
    if (c.transform && c.transform !== 'none' || c.position === 'relative' || c.position === 'absolute' || c.position === 'fixed') {
      parents.push({
        tag: el.tagName, id: el.id, class: el.className,
        position: c.position,
        transform: c.transform,
        left: c.left, right: c.right, top: c.top,
      });
    }
    el = el.parentElement;
  }
  
  return {
    metaComputed: { position: cs.position, left: cs.left, right: cs.right, top: cs.top, bottom: cs.bottom, transform: cs.transform },
    metaRect: { top: Math.round(meta.getBoundingClientRect().top), left: Math.round(meta.getBoundingClientRect().left), right: Math.round(meta.getBoundingClientRect().right) },
    parents,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
