import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });

const sizes = [[1024, 768, "1024x768"], [390, 844, "390x844"]];
for (const [w, h, label] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  const result = await page.evaluate(() => {
    const header = document.querySelector("header");
    const title = document.querySelector("header .app-title, header strong, #app-title");
    const results = {};
    
    // Inspect all text elements in header that might show orphaned letters
    if (header) {
      const allText = header.innerText;
      results.headerText = allText;
    }
    
    // Check header children for text wrapping
    const headerChildren = header ? Array.from(header.children) : [];
    results.children = headerChildren.map(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id,
        className: el.className,
        text: el.innerText.trim().substring(0, 50),
        rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
        whiteSpace: style.whiteSpace,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        overflowWrap: style.overflowWrap,
        wordBreak: style.wordBreak
      };
    });
    
    // Specifically check for the app title "MomentoBooth"
    const titleEl = document.querySelector("header strong");
    if (titleEl) {
      const span = titleEl.querySelector("span");
      results.titleFullText = titleEl.innerText;
      results.titleRect = { width: Math.round(titleEl.getBoundingClientRect().width), height: Math.round(titleEl.getBoundingClientRect().height) };
      results.spanRect = span ? { width: Math.round(span.getBoundingClientRect().width), height: Math.round(span.getBoundingClientRect().height), left: Math.round(span.getBoundingClientRect().left) } : null;
      results.spanText = span ? span.textContent : null;
      results.titleWhiteSpace = getComputedStyle(titleEl).whiteSpace;
    }
    
    return results;
  });
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(result, null, 2));
  await ctx.close();
}
await browser.close();
