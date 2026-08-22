import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });

const tests = [
  { name: "1024x768", w: 1024, h: 768, dsf: 1 },
  { name: "390x844", w: 390, h: 844, dsf: 2 },
];

for (const t of tests) {
  const ctx = await browser.newContext({ 
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: t.dsf,
  });
  const page = await ctx.newPage();
  await page.setViewportSize(t.w, t.h);
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const bb = document.querySelector(".bottom-bar");
    const bbRect = bb.getBoundingClientRect();
    const sb = document.getElementById("btn-shutter");
    const sbRect = sb.getBoundingClientRect();
    const gif = document.getElementById("shutter-hint-gif");
    const pw = window.innerWidth;
    const ph = window.innerHeight;
    return {
      viewport: `${pw}x${ph}`,
      bottomBar: { x: bbRect.x, y: bbRect.y, width: bbRect.width, height: bbRect.height, right: pw - bbRect.right },
      shutter: { x: sbRect.x, y: sbRect.y, width: sbRect.width, height: sbRect.height },
      hintDisplay: gif ? getComputedStyle(gif).display : null,
      bottomBarComputed: {
        position: getComputedStyle(bb).position,
        right: getComputedStyle(bb).right,
        top: getComputedStyle(bb).top,
      },
    };
  });
  
  console.log(`\n=== ${t.name} (${data.viewport}) ===`);
  console.log(`Bottom-bar: x=${data.bottomBar.x}, y=${data.bottomBar.y}, w=${data.bottomBar.width}, h=${data.bottomBar.height}, dist_from_right=${Math.round(data.bottomBar.right)}`);
  console.log(`Shutter: x=${data.shutter.x}, y=${data.shutter.y}, w=${data.shutter.width}, h=${data.shutter.height}`);
  console.log(`Computed: position=${data.bottomBarComputed.position}, right=${data.bottomBarComputed.right}, top=${data.bottomBarComputed.top}`);
  console.log(`Hint-gif display: ${data.hintDisplay}`);
  
  const isRightSide = data.bottomBar.right < 30 && data.bottomBar.right >= 0;
  console.log(`Toolbar on right side: ${isRightSide ? "PASS" : "FAIL"}`);
  const shutterInBar = data.shutter.x >= data.bottomBar.x - 5 && data.shutter.x + data.shutter.width <= data.bottomBar.x + data.bottomBar.width + 5;
  console.log(`Shutter within toolbar: ${shutterInBar ? "PASS" : "FAIL"}`);
  const hintHidden = data.hintDisplay === "none";
  console.log(`Shutter-hint-gif hidden: ${hintHidden ? "PASS" : "FAIL"}`);
  
  await ctx.close();
}

await browser.close();
