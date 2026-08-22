import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 768 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:8787/?role=mixed&splash=0", { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const out = {};

  // bottom-bar children
  const bb = document.querySelector('.bottom-bar');
  out.bottomBarChildren = bb ? Array.from(bb.children).map(el => ({
    tag: el.tagName,
    id: el.id,
    class: el.className.substring(0, 60),
    textContent: (el.textContent || '').trim().substring(0, 40),
    width: getComputedStyle(el).width,
    height: getComputedStyle(el).height,
    fontSize: getComputedStyle(el).fontSize,
    outerHTML: el.outerHTML.substring(0, 200),
  })) : null;

  // shutter-hint-gif
  const gif = document.getElementById('shutter-hint-gif');
  out.gif = gif ? {
    src: gif.src,
    class: gif.className,
    hidden: gif.classList.contains('hidden'),
    computedWidth: getComputedStyle(gif).width,
    computedHeight: getComputedStyle(gif).height,
  } : null;

  // gallery-top-btn
  const gtb = document.querySelector('.gallery-top-btn');
  out.galleryTopBtn = gtb ? {
    textContent: (gtb.textContent || '').trim(),
    outerHTML: gtb.outerHTML.substring(0, 300),
    computedWidth: getComputedStyle(gtb).width,
    computedHeight: getComputedStyle(gtb).height,
    whiteSpace: getComputedStyle(gtb).whiteSpace,
  } : null;

  // tablet-qr-access button (P0-G "Galerie invités")
  const tqa = document.querySelector('.tablet-qr-access');
  out.tabletQrAccess = tqa ? {
    class: tqa.className,
    hidden: tqa.classList.contains('hidden'),
    outerHTML: tqa.outerHTML.substring(0, 500),
    displayed: getComputedStyle(tqa).display,
  } : null;

  // focus-cursor
  const fc = document.getElementById('focus-cursor');
  out.focusCursor = fc ? {
    class: fc.className,
    hidden: fc.classList.contains('hidden'),
    show: fc.classList.contains('show'),
    opacity: getComputedStyle(fc).opacity,
  } : null;

  // camera-error
  const ce = document.querySelector('.camera-error');
  out.cameraError = ce ? {
    class: ce.className,
    hidden: ce.classList.contains('hidden'),
    displayed: getComputedStyle(ce).display,
    textContent: (ce.textContent || '').trim().substring(0, 150),
  } : null;

  // filter-rail-meta
  const frm = document.querySelector('.filter-rail-meta');
  out.filterRailMeta = frm ? {
    textContent: (frm.textContent || '').trim(),
    computedStyle: getComputedStyle(frm).cssText.substring(0, 400),
  } : null;

  // fx-top-btn
  const ftb = document.querySelector('.fx-top-btn');
  out.fxTopBtn = ftb ? {
    textContent: (ftb.textContent || '').trim(),
    outerHTML: ftb.outerHTML.substring(0, 300),
    computedStyle: getComputedStyle(ftb).cssText.substring(0, 300),
  } : null;

  return JSON.stringify(out, null, 2);
});

console.log(result);

// Also check for any "main" or "pointer" or cursor images
const cursorImgs = await page.evaluate(() => {
  const imgs = Array.from(document.querySelectorAll('img'));
  return imgs.filter(img => {
    const src = img.src || '';
    const cls = img.className || '';
    const id = img.id || '';
    return src.includes('cursor') || src.includes('main') || src.includes('pointer') || 
           cls.includes('cursor') || cls.includes('pointer') || id.includes('cursor') || id.includes('pointer');
  }).map(img => ({ src: img.src, id: img.id, class: img.className, visible: getComputedStyle(img).display !== 'none' }));
});
console.log('CURSOR IMGS:', JSON.stringify(cursorImgs, null, 2));

// Check all visible images
const allImgs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    id: img.id,
    class: img.className,
    display: getComputedStyle(img).display,
    width: getComputedStyle(img).width,
    height: getComputedStyle(img).height,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
  })).filter(img => img.display !== 'none');
});
console.log('VISIBLE IMAGES:', JSON.stringify(allImgs, null, 2));

await page.screenshot({ path: "/tmp/inspect-dom-screenshot.png", fullPage: true });
await browser.close();
