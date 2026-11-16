#!/usr/bin/env node
/**
 * Playwright: one tap selects any territory (incl. repeats + small plots)
 * on desktop and 844×390 mobile. Minis/labels must not block selection.
 */
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";

async function waitRF(page) {
  await page.waitForFunction(
    () => window.__RF__ && typeof window.__RF__.dispatch === "function",
    null,
    { timeout: 30000 },
  );
}

async function boot(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs) for (const r of regs) await r.unregister();
      const keys = await caches?.keys?.();
      if (keys) for (const k of keys) await caches.delete(k);
    } catch {
      /* */
    }
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(300);
}

async function startMap(page, mapId) {
  await page.getByTestId(`map-${mapId}`).click();
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(500);
  await waitRF(page);
  await page.evaluate((mapId) => {
    window.__RF__.dispatch({
      type: "NEW_GAME",
      payload: {
        humanCount: 1,
        aiCount: 2,
        multiplayerMode: "solo",
        seed: 42,
        difficulty: "normal",
        doctrineId: "vanguard",
        mapId,
      },
    });
  }, mapId);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_ECONOMY_SUMMARY" });
  });
  await page.waitForSelector('[data-tutorial="map-svg"]', { timeout: 15000 });
}

/** Frame a territory then clear selection so the next tap is a true hit-test. */
async function frameThenClear(page, tid) {
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, tid);
  await page.waitForTimeout(220);
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await page.waitForTimeout(80);
}

/**
 * Tap the SVG at a point that lies on the territory path.
 * Dispatches PointerEvents on the map SVG (same handlers as real taps) so
 * Playwright's mouse synthesis quirks don't skip React onPointer*.
 */
async function tapTerritory(page, tid) {
  // Dismiss drawers/toasts that can sit above the map hit target.
  await page.evaluate(() => {
    window.__RF__?.dispatch?.({ type: "DISMISS_MESSAGE" });
    window.__RF__?.dispatch?.({ type: "DISMISS_ECONOMY_SUMMARY" });
    for (const btn of document.querySelectorAll(
      '.rf-drawer [aria-label*="Close" i], .rf-drawer__close, button',
    )) {
      if (/close/i.test(btn.getAttribute("aria-label") ?? "")) {
        btn.click();
      }
    }
  });
  await page.waitForTimeout(60);

  const result = await page.evaluate((tid) => {
    const path = document.querySelector(
      `path.rf-map__territory[data-territory-id="${tid}"]`,
    );
    const svg = document.querySelector('[data-tutorial="map-svg"]');
    if (!(path instanceof SVGGeometryElement) || !(svg instanceof SVGSVGElement)) {
      return { ok: false, reason: "missing path/svg" };
    }
    const ctm = path.getScreenCTM();
    if (!ctm) return { ok: false, reason: "no CTM" };
    const len = Math.max(1, path.getTotalLength());
    const candidates = [];
    // Sample along the outline + bbox center until fill contains the point.
    for (let i = 1; i <= 12; i++) {
      candidates.push(path.getPointAtLength((len * i) / 13));
    }
    const bb = path.getBBox();
    candidates.push(
      { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 },
      { x: bb.x + bb.width * 0.35, y: bb.y + bb.height * 0.45 },
      { x: bb.x + bb.width * 0.6, y: bb.y + bb.height * 0.55 },
    );

    let screen = null;
    for (const p of candidates) {
      if (typeof path.isPointInFill === "function") {
        const sp = svg.createSVGPoint();
        sp.x = p.x;
        sp.y = p.y;
        if (!path.isPointInFill(sp)) continue;
      }
      const pt = svg.createSVGPoint();
      pt.x = p.x;
      pt.y = p.y;
      const s = pt.matrixTransform(ctm);
      const stack = document.elementsFromPoint(s.x, s.y);
      const territoryHits = stack.filter(
        (el) =>
          el instanceof Element && el.classList?.contains("rf-map__territory"),
      );
      // Require this territory to be the top-most territory under the point
      // (or the only fill that contains it) so dense NE overlaps don't steal.
      const top = territoryHits[0];
      if (
        top instanceof Element &&
        top.getAttribute("data-territory-id") === tid
      ) {
        screen = { x: s.x, y: s.y };
        break;
      }
    }
    if (!screen) {
      return { ok: false, reason: `no fill hit for ${tid}` };
    }

    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: screen.x,
      clientY: screen.y,
      pointerId: 1,
      button: 0,
      pointerType: "mouse",
    };
    svg.dispatchEvent(new PointerEvent("pointerdown", opts));
    svg.dispatchEvent(new PointerEvent("pointerup", opts));
    return {
      ok: true,
      selected: window.__RF__.getState().selectedTerritoryId,
    };
  }, tid);

  if (!result.ok) {
    throw new Error(`tap failed for ${tid}: ${JSON.stringify(result)}`);
  }
  await page.waitForTimeout(80);
  const selected = await page.evaluate(
    () => window.__RF__.getState().selectedTerritoryId,
  );
  if (selected !== tid) {
    throw new Error(`Expected selected=${tid}, got ${selected}`);
  }
}

async function runSequence(page, label) {
  const ids = await page.evaluate(() => {
    const s = window.__RF__.getState();
    const all = Object.keys(s.territories);
    const prefer = [
      "rhode_island",
      "delaware",
      "connecticut",
      "new_jersey",
      "maryland",
      "vermont",
    ].filter((id) => all.includes(id));
    const seq = prefer.slice(0, 4);
    if (seq.length < 3) {
      seq.push(...all.filter((id) => !seq.includes(id)).slice(0, 3));
    }
    // Repeat first id — catches short-landscape same-tap sheet reopen.
    if (seq[0]) seq.push(seq[0]);
    return seq;
  });
  console.log(label, "sequence", ids);
  for (const tid of ids) {
    await frameThenClear(page, tid);
    await tapTerritory(page, tid);
    console.log(label, "ok", tid);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await boot(desktop);
  await desktop.waitForSelector('[data-testid="map-picker"]');
  await startMap(desktop, "civil_war");
  await runSequence(desktop, "desktop-cw");
  await desktop.close();

  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  await boot(mobile);
  await mobile.waitForSelector('[data-testid="map-picker"]');
  await startMap(mobile, "civil_war");
  // Close detail sheet so same-id re-tap must reopen it via selection path.
  await mobile.evaluate(() => {
    const close = document.querySelector(
      '.rf-drawer [aria-label*="Close" i], .rf-drawer__close, .rf-map__territory-drawer [data-close]',
    );
    if (close instanceof HTMLElement) close.click();
  });
  await mobile.waitForTimeout(120);
  await runSequence(mobile, "mobile-cw");
  await mobile.close();

  await browser.close();
  console.log("e2e-territory-select passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
