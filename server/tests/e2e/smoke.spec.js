import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("le portail de rôle démarre avec ses trois modes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#role-gate")).toBeVisible();
  await expect(page.locator("#role-gate .role-option")).toHaveCount(3);
  const startup = await page.evaluate(() => window.mbTelemetry?.startupSnapshot());
  expect(startup?.htmlReadyMs).not.toBeNull();
  expect(startup?.cssReadyMs).not.toBeNull();
});

test("les assets MediaPipe réellement utilisés restent servis", async ({ request }) => {
  for (const asset of [
    "/mediapipe/vision_bundle.mjs",
    "/mediapipe/face_landmarker.task",
    "/mediapipe/wasm/vision_wasm_internal.wasm",
  ]) {
    const response = await request.get(asset);
    expect(response.ok(), `${asset} → ${response.status()}`).toBeTruthy();
  }
});

async function expectAccessible(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blockingImpacts = process.env.AXE_STRICT
    ? new Set(["critical", "serious"])
    : new Set(["critical"]);
  const blocking = result.violations.filter((violation) => blockingImpacts.has(violation.impact));
  expect(blocking, `${label}: ${JSON.stringify(result.violations, null, 2)}`).toEqual([]);
}

test("le portail ne contient pas de violation WCAG critique", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#role-gate")).toBeVisible();
  await expectAccessible(page, "portail");
});

test("chaque carte de rôle ouvre directement le rôle choisi, sans bouton de confirmation séparé", async ({ page }) => {
  await page.goto("/");
  // Le bouton « Continuer » et son option « sans connecter maintenant » ne
  // doivent plus exister nulle part dans le parcours normal.
  await expect(page.locator("#role-confirm")).toHaveCount(0);
  await expect(page.locator("#role-continue-later")).toHaveCount(0);
});

test("Caméra et Mixte s'ouvrent en un seul toucher, sans seconde validation", async ({ page }) => {
  await page.goto("/");
  await page.locator('#role-gate .role-option[data-role="mixed"]').click();
  await expect(page.locator("#role-gate")).toBeHidden({ timeout: 5000 });
});

test("Interface démarre la recherche caméra immédiatement et affiche son état sur le même écran", async ({ page }) => {
  await page.goto("/");
  await page.locator('#role-gate .role-option[data-role="interface"]').click();
  // Aucune seconde validation requise : la recherche démarre au premier
  // toucher et le statut s'affiche directement dans le portail de rôle.
  await expect(page.locator("#role-gate-status")).toHaveText(/recherche/i);
  await expect(page.locator("#role-gate")).toBeVisible();
});

test("les feuilles principales restent accessibles après ouverture en mode Interface", async ({ page }) => {
  await page.goto("/");
  await page.locator('#role-gate .role-option[data-role="interface"]').click();
  // Saisir un code à 6 caractères suffit à poursuivre — aucun bouton
  // « Continuer » à chercher ni à cliquer.
  await page.locator("#role-remote-token").fill("TESTXX");
  await expect(page.locator("#role-gate")).toBeHidden();

  for (const [trigger, sheet] of [["#btn-settings", "#sheet-settings"], ["#btn-timer-trigger", "#sheet-timer"]]) {
    await page.locator(trigger).click();
    await expect(page.locator(`${sheet}.open`)).toBeVisible();
    await expectAccessible(page, sheet);
    await page.locator(`${sheet} .sheet-close`).first().click();
    await expect(page.locator(`${sheet}.open`)).toHaveCount(0);
  }
});

test("le panneau organisateur (code PIN) fonctionne AVANT même le choix du rôle", async ({ page }) => {
  await page.goto("/");
  await page.locator("#btn-customize-access").click();
  await expect(page.locator("#customizer.open")).toBeVisible();
  await page.locator("#customizer-code").fill("0000");
  await page.locator("#customizer-unlock").click();
  await expect(page.locator("#customizer-code-status")).toHaveText(/incorrect/i);
  await page.locator("#customizer-code").fill("1818");
  await page.locator("#customizer-unlock").click();
  await expect(page.locator("#customizer-editor")).toBeVisible();
});

test("la corbeille de la galerie liste, restaure et purge réellement les photos", async ({ page }) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") await dialog.accept();
    else await dialog.accept("1818");
  });
  await page.goto("/");
  await page.locator('#role-gate .role-option[data-role="mixed"]').click();
  await page.waitForTimeout(800);

  const uploaded = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100; canvas.height = 100;
    canvas.getContext("2d").fillRect(0, 0, 100, 100);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    const form = new FormData();
    form.append("photo", blob, "e2e-trash.jpg");
    const res = await fetch("/api/photos", { method: "POST", body: form });
    return res.json();
  });
  await page.evaluate(async ({ id, deleteToken }) => {
    await fetch(`/api/photos/${id}`, { method: "DELETE", headers: { "x-photo-delete-token": deleteToken } });
  }, uploaded);

  await page.locator("#btn-gallery-top").click();
  await page.locator("#btn-trash-access").click();
  await expect(page.locator("#trash-panel.open")).toBeVisible();
  await expect(page.locator(".trash-item").first()).toBeVisible();

  await page.locator(".trash-item .trash-restore").first().click();
  await page.waitForTimeout(300);
  const restoredStatus = await page.evaluate((id) => fetch(`/api/photos/${id}`).then((r) => r.status), uploaded.id);
  expect(restoredStatus).toBe(200);
});
