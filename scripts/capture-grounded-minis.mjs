#!/usr/bin/env node
/**
 * Before/after grounded-minis screenshots.
 * Usage: RF_SHOT_TAG=before|after node scripts/capture-grounded-minis.mjs
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const TAG = process.env.RF_SHOT_TAG ?? "after";
const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";
const OUT = "/opt/cursor/artifacts";
const TMP = `/tmp/cursor/screenshots-grounded-${TAG}`;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const hashes = new Map();

async function shot(page, name) {
  const full = `${TAG}-grounded-${name}`;
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
  console.log(
    "saved",
    full,
    `(${buf.length}b)`,
    vp ? `${vp.width}x${vp.height}` : "",
  );
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

/** Zoom onto a territory path's screen center (re-aim each step). */
async function zoomOntoTerritory(page, territoryId, wheels = 8) {
  for (let i = 0; i < wheels; i++) {
    await page.evaluate((id) => {
      const svg = document.querySelector('[data-tutorial="map-svg"]');
      if (!svg) return;
      const path =
        document.querySelector(`.rf-map__territory[data-id="${id}"]`) ||
        document.querySelector(`path[data-id="${id}"]`) ||
        document.querySelector(`[data-territory-id="${id}"]`);
      let clientX;
      let clientY;
      if (path) {
        const bb = path.getBoundingClientRect();
        clientX = bb.left + bb.width / 2;
        clientY = bb.top + bb.height / 2;
      } else {
        const rect = svg.getBoundingClientRect();
        clientX = rect.left + rect.width * 0.55;
        clientY = rect.top + rect.height * 0.4;
      }
      svg.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: -120,
          clientX,
          clientY,
        }),
      );
    }, territoryId);
    await page.waitForTimeout(100);
  }
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

async function stockPlayerHome(page) {
  return page.evaluate(() => {
    const s = window.__RF__.getState();
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    if (!home) return null;
    const buildings = [
      {
        instanceId: "b_demo_1",
        buildingId: "command_nexus",
        x: 0,
        y: 0,
        hp: 40,
        buildRemaining: 0,
        workers: 2,
      },
      {
        instanceId: "b_demo_2",
        buildingId: "reactor",
        x: 1,
        y: 0,
        hp: 20,
        buildRemaining: 0,
        workers: 1,
      },
      {
        instanceId: "b_demo_3",
        buildingId: "barracks",
        x: 0,
        y: 1,
        hp: 20,
        buildRemaining: 0,
        workers: 1,
      },
      {
        instanceId: "b_demo_4",
        buildingId: "refinery",
        x: 1,
        y: 1,
        hp: 18,
        buildRemaining: 2,
        workers: 1,
      },
    ];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories: {
            ...s.territories,
            [home]: {
              ...s.territories[home],
              garrison: {
                trooper: 8,
                assault_mech: 2,
                hover_tank: 1,
              },
              buildings,
              supplyStock: 40,
            },
          },
          selectedTerritoryId: home,
          message: null,
        },
      },
    });
    return home;
  });
}

async function startMarch(page, home) {
  return page.evaluate((fromId) => {
    const s = window.__RF__.getState();
    const neighbors = window.__RF__.neighbors?.[fromId] ?? [];
    const toId =
      neighbors.find((n) => s.territories[n]?.owner !== "player") ??
      neighbors[0];
    if (!toId) return null;
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          armiesInTransit: [
            {
              id: "army_demo_march",
              owner: "player",
              fromId,
              toId,
              force: [
                { unitId: "trooper", count: 5 },
                { unitId: "hover_tank", count: 1 },
              ],
              turnsRemaining: 2,
              totalTurns: 3,
            },
          ],
          selectedTerritoryId: fromId,
        },
      },
    });
    return toId;
  }, home);
}

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
  const mobile = {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  };

  await captureViewport(
    browser,
    { ...mobile, mapId: "world_war", seed: 7 },
    "ww-europe-844x390",
    async (page) => {
      const home = await stockPlayerHome(page);
      await selectTerritory(page, home ?? "sweden");
      await zoomOntoTerritory(page, home ?? "sweden", 5);
      const chrome = await page.evaluate(() => ({
        discs: document.querySelectorAll(
          ".rf-map__unit circle, .rf-map__bldg circle, .rf-map__unit-badge",
        ).length,
        shadows: document.querySelectorAll(".rf-map__contact-shadow").length,
        grounded: document.querySelectorAll(".is-grounded").length,
      }));
      console.log("chrome-check", chrome);
      if (TAG === "after" && chrome.discs > 0) {
        throw new Error(`Expected 0 badge circles, got ${chrome.discs}`);
      }
    },
  );

  await captureViewport(
    browser,
    { ...desktop, mapId: "world_war", seed: 7 },
    "ww-player-zoom-1440",
    async (page) => {
      const home = await stockPlayerHome(page);
      await selectTerritory(page, home);
      await zoomOntoTerritory(page, home, 9);
    },
  );

  await captureViewport(
    browser,
    { ...desktop, mapId: "world_war", seed: 7 },
    "ww-march-1440",
    async (page) => {
      const home = await stockPlayerHome(page);
      await startMarch(page, home);
      await selectTerritory(page, home);
      await zoomOntoTerritory(page, home, 8);
    },
  );

  await captureViewport(
    browser,
    { ...mobile, mapId: "civil_war", seed: 99 },
    "cw-northeast-844x390",
    async (page) => {
      await selectTerritory(page, "connecticut");
      await zoomToward(page, { xFrac: 0.72, yFrac: 0.28, wheels: 6 });
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll(".rf-map__label")].map((el) =>
          (el.textContent ?? "").trim(),
        ),
      );
      console.log("cw-labels", labels.filter(Boolean).slice(0, 16));
      if (TAG === "after") {
        const bad = labels.filter(
          (t) =>
            /\s{2,}/.test(t) ||
            /Connecti\s|Hampa\s|Massach\s|York\sNew/i.test(t),
        );
        if (bad.length) throw new Error(`Broken CW labels: ${bad.join(" | ")}`);
      }
    },
  );

  await browser.close();
  console.log("done", TAG);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
