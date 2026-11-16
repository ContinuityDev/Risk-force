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
  console.log("saved", full, `(${buf.length}b)`);
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
  // Germany / France region of World War map
  await selectTerritory(page, "germany");
  await zoomToward(page, { xFrac: 0.52, yFrac: 0.38, wheels: 4 });
  await dismissToast(page);
}

async function focusCwNortheast(page) {
  await selectTerritory(page, "connecticut");
  await zoomToward(page, { xFrac: 0.72, yFrac: 0.28, wheels: 6 });
  await dismissToast(page);
}

async function captureViewport(browser, opts, shotName, run) {
  const page = await browser.newPage(opts);
  await boot(page);
  await page.waitForSelector('[data-testid="map-picker"]', { timeout: 15000 });
  await page.getByTestId(`map-${opts.mapId === "civil_war" ? "civil_war" : "world_war"}`).click();
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(600);
  await waitRF(page);
  await newGame(page, opts.mapId, opts.seed ?? 42);
  await page.waitForSelector('[data-tutorial="map-svg"]', { timeout: 15000 });
  await run(page);
  await shot(page, shotName);
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desktop = { width: 1440, height: 900, deviceScaleFactor: 1 };
  const mobile = {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  };

  // World War Europe
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

  // Civil War Northeast
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

  // Stale invade proof — planned route + march, then real RESOLVE_BATTLE scrub
  {
    const page = await browser.newPage({ ...desktop });
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
    // Open invade panel against the target so arrows/cards are visible
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        /Invade/i.test(b.textContent ?? ""),
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(250);
    await shot(page, "invade-before-capture");

    // Instant attacker-win battle → RESOLVE_BATTLE runs scrubOrdersForTerritory
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
    await page.waitForTimeout(500);
    await dismissToast(page);
    // Stay on map showing the captured land with no stale invade overlay
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
    await page.waitForTimeout(300);
    const clean = await page.evaluate(() => {
      const s = window.__RF__.getState();
      return {
        plannedRoute: s.plannedRoute,
        marches: (s.armiesInTransit ?? []).length,
        invadeArrows: document.querySelectorAll(".rf-map__invade-plans path")
          .length,
        plannedSegs: document.querySelectorAll(".rf-map__planned-seg").length,
      };
    });
    console.log("invade-clean-state", clean);
    if (TAG === "after") {
      if (clean.plannedRoute) throw new Error("plannedRoute still set after capture");
      if (clean.invadeArrows > 0) throw new Error("stale invade arrows remain");
      if (clean.plannedSegs > 0) throw new Error("stale planned route segs remain");
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
