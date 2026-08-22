import pkg from "playwright";
const { chromium } = pkg;

const browser = await chromium.launch({ headless: true });

const tests = [
  { name: "1024x768", w: 1024, h: 768, dsf: 1 },
  { name: "390x844", w: 390, h: 844, dsf: 2 },
];

const results = {};

for (const t of tests) {
  const ctx = await browser.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: t.dsf,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8787/?role=mixed&splash=0&_t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const checks = {};

    // P0-A: Bottom-bar toolbar
    const bb = document.querySelector(".bottom-bar");
    if (bb) {
      const bbRect = bb.getBoundingClientRect();
      checks["p0-a"] = {
        visible: bb.offsetParent !== null,
        right: Math.round(window.innerWidth - bbRect.right),
        computedRight: getComputedStyle(bb).right,
        hasBackdrop: getComputedStyle(bb).backdropFilter !== "none" || getComputedStyle(bb).webkitBackdropFilter !== "none",
      };
    }

    // P0-A: Shutter hint gif hidden
    const gif = document.getElementById("shutter-hint-gif");
    checks["p0-a-gif"] = gif ? { display: getComputedStyle(gif).display } : { missing: true };

    // P0-B: Camera placeholder overlay
    const camErr = document.querySelector(".camera-error");
    if (camErr) {
      const cs = getComputedStyle(camErr);
      checks["p0-b"] = {
        visible: camErr.offsetParent !== null,
        backdrop: cs.backdropFilter,
        bgRgba: cs.backgroundColor,
      };
    } else {
      checks["p0-b"] = { missing: true };
    }

    // P0-C: Filter rail meta
    const meta = document.querySelector(".filter-rail-meta");
    if (meta) {
      const metaRect = meta.getBoundingClientRect();
      const ring = document.querySelector(".filter-rail");
      const ringRect = ring ? ring.getBoundingClientRect() : null;
      checks["p0-c"] = {
        position: getComputedStyle(meta).position,
        right: getComputedStyle(meta).right,
        overlapRing: ringRect ? !(metaRect.right < ringRect.left || metaRect.left > ringRect.right) : false,
        overflowRight: metaRect.right > window.innerWidth,
      };
    } else {
      checks["p0-c"] = { missing: true };
    }

    // P0-D: Filter ring position
    const ring = document.querySelector(".filter-rail");
    if (ring) {
      const ringRect = ring.getBoundingClientRect();
      checks["p0-d"] = {
        left: Math.round(ringRect.left),
        visibleLeft: ringRect.left >= 0,
        right: Math.round(ringRect.right),
      };
    } else {
      checks["p0-d"] = { missing: true };
    }

    // P0-E: Galerie invités button
    const btn = document.querySelector(".tablet-qr-access button");
    if (btn) {
      checks["p0-e"] = {
        gridCols: getComputedStyle(btn).gridTemplateColumns,
      };
    } else {
      checks["p0-e"] = { buttonMissing: true };
    }

    // P0-F: Brand lockup no-wrap
    const brand = document.querySelector(".brand-lockup strong");
    if (brand) {
      checks["p0-f"] = {
        whiteSpace: getComputedStyle(brand).whiteSpace,
      };
    } else {
      checks["p0-f"] = { missing: true };
    }

    // P0-G: Tablet QR image onerror
    const img = document.getElementById("tablet-qr-image");
    if (img) {
      checks["p0-g"] = {
        hasOnerror: img.getAttribute("onerror") !== null,
        bgTransparent: getComputedStyle(img).backgroundColor,
      };
    } else {
      checks["p0-g"] = { missing: true };
    }

    return checks;
  });

  results[t.name] = data;
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
