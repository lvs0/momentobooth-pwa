import pkg from "playwright";
const { chromium } = pkg;
const browser = await chromium.launch({ headless: true });
for (const [w, h, label] of [[1024, 768, "1024x768"], [390, 844, "390x844"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  const result = await page.evaluate(() => {
    const img = document.getElementById("tablet-qr-image");
    const hasOnerror = img && img.getAttribute("onerror") !== null;
    return {
      imgExists: !!img,
      onerror: hasOnerror,
      src: img ? img.getAttribute("src") : null,
      loading: img ? img.getAttribute("loading") : null
    };
  });
  console.log(`${label}:`, JSON.stringify(result));
  await ctx.close();
}
await browser.close();
