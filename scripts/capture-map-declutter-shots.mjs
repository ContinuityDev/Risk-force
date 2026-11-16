#!/usr/bin/env node
/**
 * Before/after clutter screenshots + selection/stale-invade proof shots.
 * Usage: RF_SHOT_TAG=before|after node scripts/capture-map-declutter-shots.mjs
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const TAG = process.env.RF_SHOT_TAG ?? "before";
const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";
const OUT = "/opt/cursor/artifacts";
const TMP = `/tmp/cursor/screenshots-declutter-${TAG}`;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const hashes = new Map();

async function shot(page, name) {
  const full = `${TAG}-${name}`;
  const path = join(TMP, `${full}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${full}.png`));
  const buf = readFileSync(path);
  const hash = createHash("sha256").update(buf).digest("hex");
  if ([...hashes.entries()].some(([n, h]) => h === hash && n !== full)) {
    const dup = [...hashes.entries()].find(([, h]) => h === hash)?.[0];
    throw new Error(`Duplicate screenshot: ${full} === ${dup}`);
  }
  hashes.set(full, hash);
  const vp = page.viewportSize();
  console.log("saved", full, `(${buf.length}b)`, vp ? `${vp.width}x${vp.height}` : "");
}

async function waitRF(page) {
  await page.waitForFunction(
    () => window.__RF__ && typeof window.__RF__.dispatch === "function",
    null,
    { timeout: 30000 },
  );
}

async function dismissToast(page) {
  await page.evaluate(() => {
    window.__RF__?.dispatch?.({ type: "DISMISS_MESSAGE" });
    window.__RF__?.dispatch?.({ type: "DISMISS_ECONOMY_SUMMARY" });
    window.__RF__?.dispatch?.({ type: "DISMISS_NEWS_DIGEST" });
  });
  await page.waitForTimeout(80);
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
  await page.waitForTimeout(300);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(350);
}

async function newGame(page, mapId, seed = 42) {
  await page.evaluate(
    ({ mapId, seed }) => {
      window.__RF__.dispatch({
        type: "NEW_GAME",
        payload: {
          humanCount: 1,
          aiCount: 2,
          multiplayerMode: "solo",
          seed,
          difficulty: "normal",
          doctrineId: "vanguard",
          mapId,
        },
      });
    },
    { mapId, seed },
  );
  await page.waitForTimeout(350);
  await dismissToast(page);
}

async function zoomToward(page, { xFrac, yFrac, wheels, out = false }) {
  await page.evaluate(
    ({ xFrac, yFrac, wheels, out }) => {
      const svg = document.querySelector('[data-tutorial="map-svg"]');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const clientX = rect.left + rect.width * xFrac;
      const clientY = rect.top + rect.height * yFrac;
      const deltaY = out ? 120 : -120;
      for (let i = 0; i < wheels; i++) {
        svg.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY,
            clientX,
            clientY,
          }),
        );
      }
    },
    { xFrac, yFrac, wheels, out },
  );
  await page.waitForTimeout(220);
}

async function selectTerritory(page, id) {
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, id);
  await page.waitForTimeout(250);
  await dismissToast(page);
}

async function focusEurope(page) {
  await selectTerritory(page, "germany");
  await zoomToward(page, { xFrac: 0.52, yFrac: 0.38, wheels: 4 });
  await dismissToast(page);
}

async function focusCwNortheast(page) {
  await selectTerritory(page, "connecticut");
  await zoomToward(page, { xFrac: 0.72, yFrac: 0.28, wheels: 6 });
  await dismissToast(page);
}

/**
 * @param {import('playwright').Browser} browser
 * @param {{ viewport: {width:number,height:number}, deviceScaleFactor?: number, isMobile?: boolean, hasTouch?: boolean, mapId: string, seed?: number }} opts
 */
async function captureViewport(browser, opts, shotName, run) {
  const { mapId, seed = 42, ...pageOpts } = opts;
  const page = await browser.newPage(pageOpts);
  const vp = page.viewportSize();
  if (
    pageOpts.viewport &&
    (vp?.width !== pageOpts.viewport.width ||
      vp?.height !== pageOpts.viewport.height)
  ) {
    throw new Error(
      `Viewport mismatch: expected ${pageOpts.viewport.width}x${pageOpts.viewport.height}, got ${vp?.width}x${vp?.height}`,
    );
  }
  await boot(page);
  await page.waitForSelector('[data-testid="map-picker"]', { timeout: 15000 });
  await page.getByTestId(`map-${mapId}`).click();
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(600);
  await waitRF(page);
  await newGame(page, mapId, seed);
  await page.waitForSelector('[data-tutorial="map-svg"]', { timeout: 15000 });
  await run(page);
  await shot(page, shotName);
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desktop = {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  };
  const desktop1024 = {
    viewport: { width: 1024, height: 720 },
    deviceScaleFactor: 1,
  };
  const mobile = {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  };

  await captureViewport(
    browser,
    { ...desktop, mapId: "world_war", seed: 42 },
    "ww-europe-desktop",
    focusEurope,
  );
  await captureViewport(
    browser,
    { ...mobile, mapId: "world_war", seed: 42 },
    "ww-europe-844x390",
    focusEurope,
  );

  await captureViewport(
    browser,
    { ...desktop, mapId: "civil_war", seed: 99 },
    "cw-northeast-desktop",
    focusCwNortheast,
  );
  await captureViewport(
    browser,
    { ...mobile, mapId: "civil_war", seed: 99 },
    "cw-northeast-844x390",
    focusCwNortheast,
  );

  // 1024-wide HUD nav layout check
  await captureViewport(
    browser,
    { ...desktop1024, mapId: "world_war", seed: 42 },
    "hud-nav-1024",
    async (page) => {
      await selectTerritory(page, "germany");
      await dismissToast(page);
    },
  );

  // Stale invade + toast copy + route pill
  {
    const page = await browser.newPage(desktop);
    await boot(page);
    await page.waitForSelector('[data-testid="map-picker"]', { timeout: 15000 });
    await page.getByTestId("map-world_war").click();
    await page.getByRole("button", { name: /^Start$/i }).click();
    await page.waitForTimeout(600);
    await waitRF(page);
    await newGame(page, "world_war", 7);
    await page.waitForSelector('[data-tutorial="map-svg"]', { timeout: 15000 });

    const ids = await page.evaluate(() => {
      const s = window.__RF__.getState();
      const home = Object.entries(s.territories).find(
        ([, t]) => t.owner === "player",
      )?.[0];
      const neighbors = window.__RF__.neighbors?.[home] ?? [];
      const target =
        neighbors.find((n) => s.territories[n]?.owner === "neutral") ??
        neighbors[0];
      if (!home || !target) return null;

      const territories = {
        ...s.territories,
        [home]: {
          ...s.territories[home],
          garrison: { trooper: 12, assault_mech: 2 },
          supplyStock: 40,
        },
        [target]: {
          ...s.territories[target],
          owner: "neutral",
          garrison: { trooper: 1 },
          buildings: [],
        },
      };
      window.__RF__.dispatch({
        type: "LOAD_STATE",
        payload: {
          state: {
            ...s,
            territories,
            selectedTerritoryId: target,
            plannedRoute: [home, target],
            armiesInTransit: [
              {
                id: "army_stale_demo",
                owner: "player",
                fromId: home,
                toId: target,
                force: [{ unitId: "trooper", count: 6 }],
                turnsRemaining: 2,
                totalTurns: 2,
              },
            ],
            message: null,
          },
        },
      });
      return { home, target };
    });
    await page.waitForTimeout(300);
    await dismissToast(page);
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        /Invade/i.test(b.textContent ?? ""),
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(250);
    await shot(page, "invade-before-capture");

    // Assert route pill copy
    const pill = await page.evaluate(() => {
      const t = document.querySelector(".rf-map__route-eta");
      return t?.textContent?.trim() ?? null;
    });
    console.log("route-pill", pill);
    if (TAG === "after" && pill && !/turn/i.test(pill)) {
      throw new Error(`Route pill should say turns, got: ${pill}`);
    }

    await page.evaluate(({ home, target }) => {
      const s = window.__RF__.getState();
      const battle = window.__RF__.createBattle(
        s,
        target,
        "player",
        [{ unitId: "trooper", count: 10 }],
        home,
      );
      const forced = {
        ...battle,
        status: "attacker_win",
        units: battle.units.map((u) =>
          u.side === "defender" ? { ...u, alive: false, hp: 0 } : u,
        ),
      };
      window.__RF__.dispatch({
        type: "LOAD_STATE",
        payload: {
          state: {
            ...s,
            battle: forced,
            phase: "battle",
            screen: "battle",
          },
        },
      });
      window.__RF__.dispatch({ type: "RESOLVE_BATTLE" });
    }, ids);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const s = window.__RF__.getState();
      if (s.pendingCapture) {
        window.__RF__.dispatch({
          type: "CONFIRM_CAPTURE",
          payload: { occupyCount: 4, disposition: "keep" },
        });
      }
      window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    });
    await page.waitForTimeout(350);
    const toast = await page.evaluate(() => window.__RF__.getState().message);
    console.log("capture-toast", toast);
    if (TAG === "after") {
      if (!toast || /_[a-z]/.test(toast) || /\boccupy\./i.test(toast)) {
        throw new Error(`Bad capture toast: ${toast}`);
      }
      if (!/secured|razed/i.test(toast) || !/occupying/i.test(toast)) {
        throw new Error(`Expected display-name capture toast, got: ${toast}`);
      }
    }
    await shot(page, "invade-after-capture-clean");
    await page.close();
  }

  await browser.close();
  console.log("done", TAG);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
