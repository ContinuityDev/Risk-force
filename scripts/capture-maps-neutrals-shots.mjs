#!/usr/bin/env node
/**
 * Review screenshots for Civil War / neutrals / lobby map picker.
 * 1) Full Civil War USA desktop (AK/HI insets)
 * 2) Northeast zoom (NE/NJ/DE/MD/RI/CT labels)
 * 3) Civil War mid-game mobile 844×390
 * 4) Lobby map picker mobile 844×390
 * 5) News Report after AI turn with neutral captures
 * Plus prior desktop lobby / turn-1 neutrals shots.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-maps";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const hashes = new Map();

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  const buf = readFileSync(path);
  const hash = createHash("sha256").update(buf).digest("hex");
  if ([...hashes.entries()].some(([n, h]) => h === hash && n !== name)) {
    const dup = [...hashes.entries()].find(([, h]) => h === hash)?.[0];
    throw new Error(`Duplicate screenshot: ${name} === ${dup}`);
  }
  hashes.set(name, hash);
  console.log("saved", name, `(${buf.length}b)`);
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
  await page.waitForTimeout(100);
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
  await page.waitForTimeout(350);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(400);
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
  await page.waitForTimeout(400);
  await dismissToast(page);
}

async function zoomToward(page, { xFrac, yFrac, wheels, out = false }) {
  const svg = page.locator('[data-tutorial="map-svg"]');
  const box = await svg.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width * xFrac, box.y + box.height * yFrac);
  const delta = out ? 600 : -400;
  for (let i = 0; i < wheels; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(200);
}

/** Zoom all the way out so AK/HI insets are in frame. */
async function zoomWorld(page) {
  await zoomToward(page, { xFrac: 0.4, yFrac: 0.45, wheels: 24, out: true });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ── Desktop ──────────────────────────────────────────────
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  await boot(desktop);
  await desktop.waitForSelector('[data-testid="map-picker"]', { timeout: 15000 });
  await shot(desktop, "desktop-lobby-map-picker");

  await desktop.getByTestId("map-world_war").click();
  await desktop.getByRole("button", { name: /^Start$/i }).click();
  await desktop.waitForTimeout(700);
  await waitRF(desktop);
  await newGame(desktop, "world_war", 42);

  const home = await desktop.evaluate(() => {
    const s = window.__RF__.getState();
    return Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0];
  });
  await desktop.evaluate((hid) => {
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: hid } });
  }, home);
  await desktop.waitForTimeout(250);
  await dismissToast(desktop);
  await shot(desktop, "desktop-turn1-world-war-neutrals");

  // Civil War full map — AK/HI insets visible at world zoom
  await newGame(desktop, "civil_war", 99);
  await dismissToast(desktop);
  await desktop.waitForTimeout(300);
  // Selection auto-focuses home; zoom fully out for the continental + inset frame.
  await zoomWorld(desktop);
  await dismissToast(desktop);
  await shot(desktop, "desktop-civil-war-full-ak-hi");

  // Northeast zoom — labels for New England + NJ/DE/MD/RI/CT
  await desktop.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: "connecticut" },
    });
  });
  await desktop.waitForTimeout(300);
  // Deepen past select-focus so RI/DE unlock labels (rel thresholds).
  await zoomToward(desktop, { xFrac: 0.72, yFrac: 0.28, wheels: 8 });
  await dismissToast(desktop);
  await shot(desktop, "desktop-civil-war-northeast-zoom");

  // Mid-zoom Civil War with building/unit minis
  await desktop.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: "texas" },
    });
  });
  await desktop.waitForTimeout(200);
  await zoomToward(desktop, { xFrac: 0.42, yFrac: 0.55, wheels: 6 });
  await dismissToast(desktop);
  await shot(desktop, "desktop-civil-war-midzoom-minis");

  // News Report after AI turn with neutral captures
  await newGame(desktop, "civil_war", 55);
  await desktop.evaluate(() => {
    const s = window.__RF__.getState();
    const aiId = s.playerOrder.find((id) => s.players[id]?.kind === "ai");
    const aiHome = Object.entries(s.territories).find(([, t]) => t.owner === aiId)?.[0];
    const neutrals = Object.entries(s.territories)
      .filter(([, t]) => t.owner === "neutral")
      .slice(0, 3)
      .map(([id]) => id);
    const territories = { ...s.territories };
    for (const id of neutrals) {
      territories[id] = {
        ...territories[id],
        owner: aiId,
        control: "occupied",
        garrison: { trooper: 2 },
      };
    }
    const named = neutrals.map((id, i) => {
      const label = id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        id: `n-ai-cap-${i}`,
        turn: s.turn,
        category: "territory",
        headline: `Neutral ${label} captured`,
        body: `AI forces secured unclaimed land. Occupation of ${label} begins.`,
        factionId: aiId,
        timestamp: Date.now() + i,
      };
    });
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories,
          newsFeed: [...named, ...(s.newsFeed ?? [])],
          newsUnread: named.length,
          newsDigest: named,
          message: null,
          selectedTerritoryId: aiHome ?? neutrals[0],
        },
      },
    });
  });
  await desktop.waitForTimeout(500);
  const digest = desktop.locator(".rf-news");
  if (!(await digest.count())) {
    const newsBtn = desktop.locator(".rf-hud__news, [aria-label*='News' i]");
    if (await newsBtn.count()) await newsBtn.first().click();
    else {
      await desktop.evaluate(() => {
        window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
      });
      // Force-open via clicking HUD news if present
      const btn = desktop.getByRole("button", { name: /News/i });
      if (await btn.count()) await btn.first().click();
    }
  }
  await desktop.waitForSelector(".rf-news", { timeout: 8000 }).catch(() => {});
  await desktop.waitForTimeout(250);
  await shot(desktop, "desktop-news-report-neutral-captures");

  await desktop.close();

  // ── Mobile 844×390 ───────────────────────────────────────
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  await boot(mobile);
  await mobile.waitForSelector('[data-testid="map-picker"]', { timeout: 15000 });
  await shot(mobile, "mobile-lobby-map-picker-844x390");

  await mobile.getByTestId("map-civil_war").click();
  await mobile.getByRole("button", { name: /^Start$/i }).click();
  await mobile.waitForTimeout(700);
  await waitRF(mobile);
  await newGame(mobile, "civil_war", 88);
  await mobile.waitForSelector('[data-tutorial="map-svg"]', { timeout: 15000 });
  // Mid-game: give player a few territories + buildings visible
  await mobile.evaluate(() => {
    const s = window.__RF__.getState();
    const home =
      Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0] ??
      "texas";
    const neigh = (window.__RF__.neighbors?.[home] ?? []).slice(0, 2);
    const territories = { ...s.territories };
    for (const id of neigh) {
      territories[id] = {
        ...territories[id],
        owner: "player",
        control: "occupied",
        garrison: { trooper: 3, assault_mech: 1 },
        buildings: territories[home].buildings.slice(0, 3),
        workers: 6,
      };
    }
    territories[home] = {
      ...territories[home],
      garrison: { trooper: 5, assault_mech: 1, drone: 2 },
    };
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          turn: 4,
          territories,
          selectedTerritoryId: home,
          message: null,
        },
      },
    });
  });
  await mobile.waitForTimeout(350);
  await dismissToast(mobile);
  const mHome = await mobile.evaluate(() => {
    const s = window.__RF__.getState();
    return Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0];
  });
  await mobile.evaluate((hid) => {
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: hid } });
  }, mHome);
  await mobile.waitForTimeout(200);
  await zoomToward(mobile, { xFrac: 0.45, yFrac: 0.5, wheels: 5 });
  await dismissToast(mobile);
  await shot(mobile, "mobile-civil-war-midgame-844x390");

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
