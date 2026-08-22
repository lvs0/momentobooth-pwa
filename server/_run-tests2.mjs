import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });

const tests = [
  { name: "1024x768", viewport: { width: 1024, height: 768, deviceScaleFactor: 1 } },
  { name: "390x844", viewport: { width: 390, height: 844, deviceScaleFactor: 2 } },
];

for (const t of tests) {
  const ctx = await browser.newContext(t.viewport);
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const bb = document.querySelector(".bottom-bar");
    const bbRect = bb.getBoundingClientRect();
    const sb = document.getElementById("btn-shutter");
    const sbRect = sb.getBoundingClientRect();
    const gif = document.getElementById("shutter-hint-gif");
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      bottomBar: { x: bbRect.x, y: bbRect.y, width: bbRect.width, height: bbRect.height, right: window.innerWidth - bbRect.right },
      shutter: { x: sbRect.x, y: sbRect.y, width: sbRect.width, height: sbRect.height },
      hintDisplay: gif ? getComputedStyle(gif).display : null,
      bottomBarComputed: {
        position: getComputedStyle(bb).position,
        right: getComputedStyle(bb).right,
        top: getComputedStyle(bb).top,
        transform: getComputedStyle(bb).transform,
      },
    };
  });
  
  console.log(`\n=== ${t.name} (${data.viewport}) ===`);
  console.log(`Bottom-bar: x=${data.bottomBar.x}, y=${data.bottomBar.y}, width=${data.bottomBar.width}, height=${data.bottomBar.height}, distance_from_right=${data.bottomBar.right}`);
  console.log(`Shutter-btn: x=${data.shutter.x}, y=${data.shutter.y}, width=${data.shutter.width}, height=${data.shutter.height}`);
  console.log(`Hint-gif display: ${data.hintDisplay}`);
  console.log(`Computed: position=${data.bottomBarComputed.position}, right=${data.bottomBarComputed.right}, top=${data.bottomBarComputed.top}, transform=${data.bottomBarComputed.transform}`);
  
  const isRightSide = data.bottomBar.right < 30;
  console.log(`Toolbar on right side: ${isRightSide ? "PASS" : "FAIL"}`);
  const shutterInBar = data.shutter.x >= data.bottomBar.x - 5 && data.shutter.x + data.shutter.width <= data.bottomBar.x + data.bottomBar.width + 5;
  console.log(`Shutter within toolbar: ${shutterInBar ? "PASS" : "FAIL"}`);
  const hintHidden = data.hintDisplay === "none";
  console.log(`Shutter-hint-gif hidden: ${hintHidden ? "PASS" : "FAIL"}`);
  
  await ctx.close();
}

await browser.close();
