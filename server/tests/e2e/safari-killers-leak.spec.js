import { test, expect, devices } from "@playwright/test";

/**
 * Safari-killers leak verification (Phase 1 audit).
 *
 * Strategy: inject a probe at page load that wraps window.addEventListener
 * and document.addEventListener to track every add/remove call during the
 * session. After N interactions (gallery toggle, settings open/close, etc.),
 * we assert that the net listener count on window/document has NOT grown.
 *
 * This is the most reliable cross-browser approach — it doesn't depend on
 * CDP DOMDebugger domains (which aren't always available) and works in
 * both headed and headless mode.
 */

// Injects a listener tracker and returns the initial snapshot of counts.
async function installListenerTracker(page) {
  await page.addInitScript(() => {
    window.__mbListenerTracker = {
      winAdd: 0,
      winRem: 0,
      docAdd: 0,
      docRem: 0,
      winAddByType: {},
      docAddByType: {},
    };
    const track = window.__mbListenerTracker;
    const origWinAdd = window.addEventListener.bind(window);
    const origWinRem = window.removeEventListener.bind(window);
    const origDocAdd = document.addEventListener.bind(document);
    const origDocRem = document.removeEventListener.bind(document);

    window.addEventListener = function (type, listener, options) {
      track.winAdd++;
      track.winAddByType[type] = (track.winAddByType[type] || 0) + 1;
      return origWinAdd(type, listener, options);
    };
    window.removeEventListener = function (type, listener, options) {
      track.winRem++;
      return origWinRem(type, listener, options);
    };
    document.addEventListener = function (type, listener, options) {
      track.docAdd++;
      track.docAddByType[type] = (track.docAddByType[type] || 0) + 1;
      return origDocAdd(type, listener, options);
    };
    document.removeEventListener = function (type, listener, options) {
      track.docRem++;
      return origDocRem(type, listener, options);
    };
  });
}

async function snapshotTrackers(page) {
  return page.evaluate(() => {
    const t = window.__mbListenerTracker;
    return t
      ? { winAdd: t.winAdd, winRem: t.winRem, docAdd: t.docAdd, docRem: t.docRem }
      : null;
  });
}

test.describe("Safari-killers — listener leak verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().grantPermissions(["camera", "microphone"]);
  });

  test("gallery toggle 5x does not accumulate listeners on window/document", async ({ page }) => {
    await installListenerTracker(page);
    await page.goto("/");

    // Select "mixed" role to get past the role gate
    await page.locator('#role-gate .role-option[data-role="mixed"]').click();
    await page.waitForSelector("#screen-capture", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const before = await snapshotTrackers(page);
    expect(before).not.toBeNull();

    // Click gallery toggle 5x (open gallery + return to capture)
    for (let i = 0; i < 5; i++) {
      await page.locator("#btn-gallery-top").click({ timeout: 5000 });
      await page.waitForTimeout(400);
      await page.locator("#btn-back-capture").click().catch(() => {});
      await page.waitForTimeout(400);
    }

    const after = await snapshotTrackers(page);

    const winNet = after.winAdd - after.winRem - (before.winAdd - before.winRem);
    const docNet = after.docAdd - after.docRem - (before.docAdd - before.docRem);

    expect(winNet, `window net listeners grew by ${winNet}`).toBeLessThanOrEqual(2);
    expect(docNet, `document net listeners grew by ${docNet}`).toBeLessThanOrEqual(2);
  });

  test("settings sheet open/close 5x does not accumulate listeners", async ({ page }) => {
    await installListenerTracker(page);
    await page.goto("/");

    // Select "mixed" role — settings are available once in capture mode
    await page.locator('#role-gate .role-option[data-role="mixed"]').click();
    await page.waitForSelector("#btn-settings", { timeout: 10000 });
    await page.waitForTimeout(1500);

    const before = await snapshotTrackers(page);

    // Open/close settings sheet 5x — each open binds focus trap keydown
    for (let i = 0; i < 5; i++) {
      await page.locator("#btn-settings").click();
      await page.waitForSelector("#sheet-settings.open", { timeout: 5000 });
      await page.locator("#sheet-settings .sheet-close").first().click().catch(async () => {
        await page.keyboard.press("Escape");
      });
      await page.waitForTimeout(200);
    }

    const after = await snapshotTrackers(page);

    const docNet = after.docAdd - after.docRem - (before.docAdd - before.docRem);
    expect(docNet, `document net listeners grew by ${docNet}`).toBeLessThanOrEqual(2);
  });

  test("filter rail rebuild does not accumulate pointer/keydown listeners", async ({ page }) => {
    await installListenerTracker(page);
    await page.goto("/");
    await page.locator('#role-gate .role-option[data-role="mixed"]').click();
    await page.waitForTimeout(1500);

    const before = await snapshotTrackers(page);

    // Trigger filter rail rebuild by cycling performance modes
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const el = document.getElementById("set-performance");
        if (el) {
          const opts = el.options;
          const next = (parseInt(el.value || "0") + 1) % Math.max(1, opts.length);
          el.value = opts[next]?.value || el.value;
          el.dispatchEvent(new MouseEvent("change", { bubbles: true }));
        }
      });
      await page.waitForTimeout(300);
    }

    const after = await snapshotTrackers(page);

    const docNet = after.docAdd - after.docRem - (before.docAdd - before.docRem);
    expect(docNet, `document net listeners grew by ${docNet}`).toBeLessThanOrEqual(2);
  });
});
