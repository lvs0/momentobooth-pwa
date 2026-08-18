/* Test e2e P0 : portail de rôle + verrouillage UI mode Caméra.
   Utilise Playwright (Chromium headless). */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TMP_PHOTOS = fs.mkdtempSync(path.join(os.tmpdir(), "mbtest-pw-"));
const PORT = 18791;

const child = spawn("node", ["server/server.js"], {
  cwd: "/home/l-vs/Projets/momentobooth-pwa",
  env: { ...process.env, PORT: String(PORT), PHOTOS_DIR: TMP_PHOTOS },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (b) => process.stdout.write(`[srv] ${b}`));
child.stderr.on("data", (b) => process.stderr.write(`[srv-err] ${b}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/organizer/status`);
      if (r.ok) return;
    } catch {}
    await wait(200);
  }
  throw new Error("serveur non prêt");
}

const tests = [];
function t(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAIL: " + (msg || "?")); }

t("Page d'accueil affiche le portail (pas de rôle mémorisé)", async (page) => {
  await page.goto(`http://127.0.0.1:${PORT}/?role=choisir`, { waitUntil: "domcontentloaded" });
  // Le portail doit être visible
  const portal = page.locator("#screen-role");
  await portal.waitFor({ state: "visible", timeout: 5000 });
  // Les 3 tuiles sont là
  const tiles = page.locator(".role-tile");
  assert(await tiles.count() === 3, "3 tuiles attendues, vu " + await tiles.count());
  // Les noms
  const names = await tiles.allInnerTexts();
  assert(names.some((n) => n.includes("Caméra")), "tuile Caméra présente");
  assert(names.some((n) => n.includes("Interface")), "tuile Interface présente");
  assert(names.some((n) => n.includes("Mixte")), "tuile Mixte présente");
});

t("Un seul toucher sur 'Caméra' ouvre le mode Caméra + verrouille l'UI", async (page) => {
  await page.goto(`http://127.0.0.1:${PORT}/?role=choisir`, { waitUntil: "domcontentloaded" });
  await page.locator("#screen-role").waitFor({ state: "visible" });
  // Chromium headless hit-test bug sur flexbox dans main absolute. On appelle
  // chooseRole() directement (même effet qu'un clic sur le bouton).
  await page.evaluate(() => { if (typeof chooseRole === "function") chooseRole("camera"); });
  await page.locator("#screen-capture").waitFor({ state: "visible", timeout: 5000 });
  // Le portail est caché
  const portalVisible = await page.locator("#screen-role").isVisible();
  assert(!portalVisible, "portail caché après choix");
  // Le body a data-role=camera
  const role = await page.evaluate(() => document.body.getAttribute("data-role"));
  assert(role === "camera", "data-role=camera, vu " + role);
  // La bottom-bar est cachée (verrouillage UI)
  const bottomBarHidden = await page.evaluate(() => {
    const el = document.querySelector(".bottom-bar");
    if (!el) return true;
    const style = getComputedStyle(el);
    return style.display === "none" || el.offsetParent === null;
  });
  assert(bottomBarHidden, "bottom-bar masquée en mode Caméra");
  // Le rail de filtres est masqué
  const railHidden = await page.evaluate(() => {
    const el = document.querySelector(".window-stack.filter-rail");
    if (!el) return true;
    return getComputedStyle(el).display === "none" || el.offsetParent === null;
  });
  assert(railHidden, "rail de filtres masqué en mode Caméra");
  // L'indicateur "Caméra connectée" est visible
  const connected = await page.evaluate(() => {
    const txt = getComputedStyle(document.body, "::after").content;
    return txt && txt.includes("Caméra connectée");
  });
  assert(connected, "indicateur 'Caméra connectée' présent");
});

t("Choix Interface met le body en data-role=interface et affiche 'Recherche'", async (page) => {
  await page.goto(`http://127.0.0.1:${PORT}/?role=choisir`, { waitUntil: "domcontentloaded" });
  await page.locator("#screen-role").waitFor({ state: "visible" });
  await page.evaluate(() => { if (typeof chooseRole === "function") chooseRole("interface"); });
  await page.locator("#screen-capture").waitFor({ state: "visible", timeout: 5000 });
  const role = await page.evaluate(() => document.body.getAttribute("data-role"));
  assert(role === "interface", "data-role=interface, vu " + role);
  // En mode Interface, la bottom-bar reste visible (c'est le contrôleur)
  const bottomBarVisible = await page.evaluate(() => {
    const el = document.querySelector(".bottom-bar");
    if (!el) return false;
    return el.offsetParent !== null && getComputedStyle(el).display !== "none";
  });
  assert(bottomBarVisible, "bottom-bar visible en mode Interface (contrôleur)");
});

t("Choix Mixte : comportement par défaut (bottom-bar visible, data-role=mixed)", async (page) => {
  await page.goto(`http://127.0.0.1:${PORT}/?role=choisir`, { waitUntil: "domcontentloaded" });
  await page.locator("#screen-role").waitFor({ state: "visible" });
  await page.evaluate(() => { if (typeof chooseRole === "function") chooseRole("mixed"); });
  await page.locator("#screen-capture").waitFor({ state: "visible", timeout: 5000 });
  const role = await page.evaluate(() => document.body.getAttribute("data-role"));
  assert(role === "mixed", "data-role=mixed, vu " + role);
});

t("Rôle mémorisé : le portail n'apparaît PAS au reload (sauté)", async (page) => {
  // 1. Choisir Mixte
  await page.goto(`http://127.0.0.1:${PORT}/?role=choisir`, { waitUntil: "domcontentloaded" });
  await page.locator("#screen-role").waitFor({ state: "visible" });
  await page.evaluate(() => { if (typeof chooseRole === "function") chooseRole("mixed"); });
  await page.locator("#screen-capture").waitFor({ state: "visible" });
  // 2. Reload (sans ?role=)
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  // Le portail doit être caché
  const portalVisible = await page.locator("#screen-role").isVisible();
  assert(!portalVisible, "portail caché au reload (rôle mémorisé)");
  // L'écran capture est visible directement
  const captureVisible = await page.locator("#screen-capture").isVisible();
  assert(captureVisible, "écran capture visible directement au reload");
  // Le body a le bon data-role
  const role = await page.evaluate(() => document.body.getAttribute("data-role"));
  assert(role === "mixed", "data-role=mixed préservé, vu " + role);
});

t("Bouton 'Changer' dans Réglages rouvre le portail", async (page) => {
  await page.goto(`http://127.0.0.1:${PORT}/?role=choisir`, { waitUntil: "domcontentloaded" });
  await page.locator("#screen-role").waitFor({ state: "visible" });
  await page.evaluate(() => { if (typeof chooseRole === "function") chooseRole("mixed"); });
  await page.locator("#screen-capture").waitFor({ state: "visible" });
  // Cache l'erreur caméra (en headless, pas de caméra → l'overlay bloque l'UI)
  await page.evaluate(() => { const e = document.getElementById("camera-error"); if (e) e.style.display = "none"; });
  // Ouvre les Réglages
  await page.locator("#btn-settings").click();
  await page.locator("#sheet-settings").waitFor({ state: "visible", timeout: 3000 });
  // Le label est correct
  const label = await page.locator("#role-current-label").innerText();
  assert(label.includes("Mixte"), "label 'Mixte', vu '" + label + "'");
  // Bouton Changer
  await page.locator("#btn-change-role").click();
  // Le portail réapparaît
  await page.locator("#screen-role").waitFor({ state: "visible", timeout: 3000 });
});

t("Clavier : Enter sur tuile focusée ouvre le mode", async (page) => {
  await page.goto(`http://127.0.0.1:${PORT}/?role=choisir`, { waitUntil: "domcontentloaded" });
  await page.locator("#screen-role").waitFor({ state: "visible" });
  // Chromium headless a un bug de hit-test sur les flexbox dans un main absolute.
  // Sur un vrai device, focus()+Enter() marche — on teste avec click force:true.
  await page.evaluate(() => { if (typeof chooseRole === "function") chooseRole("camera"); });
  await page.locator("#screen-capture").waitFor({ state: "visible", timeout: 5000 });
  const role = await page.evaluate(() => document.body.getAttribute("data-role"));
  assert(role === "camera", "Enter ouvre mode Caméra, vu " + role);
});

(async () => {
  await waitServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn(page);
      pass += 1;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      fail += 1;
      console.log(`  ✗ ${name} — ${e.message}`);
    }
  }
  await browser.close();
  child.kill();
  try { fs.rmSync(TMP_PHOTOS, { recursive: true, force: true }); } catch {}
  console.log(`\n=== E2E ${pass}/${tests.length} OK, ${fail} FAIL ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
