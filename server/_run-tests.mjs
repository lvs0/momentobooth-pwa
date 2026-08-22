import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });

const tests = [
  { name: "1024x768", viewport: { width: 1024, height: 768 } },
  { name: "390x844", viewport: { width: 390, height: 844, deviceScaleFactor: 2 } },
];

for (const t of tests) {
  const ctx = await browser.newContext(t.viewport);
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  
  // P0-A: Check bottom-bar is on the right side
  const bottomBar = await page.$(".bottom-bar");
  const bbRect = await bottomBar?.boundingBox();
  const shutterBtn = await page.$("#btn-shutter");
  const sbRect = await shutterBtn?.boundingBox();
  const hintGif = await page.$("#shutter-hint-gif");
  const hintDisplay = await page.evaluate(() => {
    const el = document.getElementById("shutter-hint-gif");
    return el ? getComputedStyle(el).display : null;
  });
  
  console.log(`\n=== ${t.name} ===`);
  console.log(`Bottom-bar: x=${bbRect.x}, right=${t.viewport.width - bbRect.x - bbRect.width}, y=${bbRect.y}, width=${bbRect.width}, height=${bbRect.height}`);
  console.log(`Shutter-btn: x=${sbRect.x}, y=${sbRect.y}, width=${sbRect.width}, height=${sbRect.height}`);
  console.log(`Shutter-hint-gif display: ${hintDisplay}`);
  
  // Verify toolbar is on right side
  const rightEdge = t.viewport.width - bbRect.x - bbRect.width;
  const isRightSide = rightEdge < 30; // within 30px of right edge
  console.log(`Toolbar on right side: ${isRightSide ? "PASS" : "FAIL"}`);
  
  // Verify shutter is within bottom-bar
  const shutterInBar = sbRect.x >= bbRect.x && sbRect.x + sbRect.width <= bbRect.x + bbRect.width;
  console.log(`Shutter within toolbar: ${shutterInBar ? "PASS" : "FAIL"}`);
  
  // Verify hint gif is hidden
  const hintHidden = hintDisplay === "none";
  console.log(`Shutter-hint-gif hidden: ${hintHidden ? "PASS" : "FAIL"}`);
  
  await ctx.close();
}

await browser.close();
