import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const BASE = 'http://localhost:8787';
const OUT = '/home/l-vs/Projets/momentobooth-pwa/screenshots/levy-2026-08-21';
const VIEWPORTS = [
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];
const PATHS = [
  { route: '?role=mixed&splash=0', file: 'home' },
  { route: '?role=mixed&splash=0#screen-gallery', file: 'gallery' },
  { route: '?role=mixed&splash=0#sheet-settings', file: 'settings' },
];

(async () => {
  await fs.mkdir(path.join(OUT, 'before'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'after'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const p of PATHS) {
      await page.goto(`${BASE}/${p.route}`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, 'before', `${p.file}-${vp.name}.png`), fullPage: true });
      console.log(`before ${p.file}-${vp.name}`);
    }
  }

  await browser.close();
})();
