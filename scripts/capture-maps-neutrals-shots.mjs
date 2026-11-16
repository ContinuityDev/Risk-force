#!/usr/bin/env node
/**
 * Review screenshots for Civil War / neutrals / lobby map picker.
 * 1) Full Civil War USA desktop (AK/HI insets) — restored slate neutrals
 * 2) Northeast zoom (abbreviations / state names)
 * 3) Collapsed continent legend on a mid viewport
 * 4) Civil War mid-game mobile 844×390
 * 5) Lobby map picker mobile 844×390
 * 6) News Report after 2–3 real AI turns (reachable captures only)
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
  // Dispatch on the SVG — Playwright mouse.wheel often misses React onWheel.
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
  await page.waitForTimeout(250);
}

/** Zoom all the way out so AK/HI insets + abbrevs are in frame. */
async function zoomWorld(page) {
  await page.evaluate(() => {
    window.__RF__?.dispatch?.({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await page.waitForTimeout(100);
  await zoomToward(page, { xFrac: 0.45, yFrac: 0.48, wheels: 28, out: true });
}

/** Buff AI + thin neighboring neutrals so early captures land. */
async function prepAiExpansion(page) {
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const neighbors = window.__RF__.neighbors ?? {};
    const territories = { ...s.territories };
    for (const [id, ts] of Object.entries(territories)) {
      const p = s.players[ts.owner];
      if (!p || p.kind !== "ai") continue;
      territories[id] = {
        ...ts,
        garrison: { trooper: 14, assault_mech: 2, drone: 1 },
        supplyStock: 40,
      };
      for (const nid of neighbors[id] ?? []) {
        if (territories[nid]?.owner !== "neutral") continue;
        territories[nid] = {
          ...territories[nid],
          garrison: { trooper: 1 },
          buildings: [],
        };
      }
    }
    const players = { ...s.players };
    for (const [pid, p] of Object.entries(players)) {
      if (p.kind !== "ai") continue;
      players[pid] = {
        ...p,
        resources: {
          ...p.resources,
          energy: Math.max(p.resources.energy, 4000),
          alloy: Math.max(p.resources.alloy, 400),
          supply: Math.max(p.resources.supply, 80),
        },
      };
    }
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: { state: { ...s, territories, players, message: null } },
    });
  });
  await page.waitForTimeout(200);
}

/** After AI marches, snap ETA to 1 so captures land within a few End Turns. */
async function hastenAiMarches(page) {
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const armies = (s.armiesInTransit ?? []).map((a) => {
      const kind = s.players[a.owner]?.kind;
      return kind === "ai" ? { ...a, turnsRemaining: 1 } : a;
    });
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: { state: { ...s, armiesInTransit: armies } },
    });
  });
}

/**
 * Human ends turn; wait for AI chain + optional arrival battles to settle
 * back on the human player's play phase (or a news digest).
 */
async function endHumanTurnAndWait(page) {
  await dismissToast(page);
  await page.getByRole("button", { name: /End Turn/i }).click();
  // Allow AI turns + fast-forward battles + news digest
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(200);
    const settled = await page.evaluate(() => {
      const s = window.__RF__?.getState?.();
      if (!s) return false;
      const pid = s.playerOrder[s.activePlayerIndex];
      const p = s.players[pid];
      if (s.phase === "battle") return false;
      if (s.newsDigest && s.newsDigest.length > 0) return true;
      return s.phase === "play" && p?.kind === "human";
    });
    if (settled) break;
  }
  await page.waitForTimeout(250);
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

  // Civil War full map — restored slate neutrals (no parchment / hatch)
  await newGame(desktop, "civil_war", 99);
  await dismissToast(desktop);
  await desktop.waitForTimeout(300);
  await zoomWorld(desktop);
  await dismissToast(desktop);
  await shot(desktop, "desktop-civil-war-full-ak-hi");

  // Restored slate neutrals at world zoom (abbrevs TX/CA/…, no parchment/hatch)
  await desktop.evaluate(() => {
    const btn = document.querySelector('[data-testid="continent-legend-toggle"]');
    const aside = document.querySelector('[data-testid="continent-legend"]');
    if (btn && aside && !aside.classList.contains("is-collapsed")) btn.click();
  });
  await dismissToast(desktop);
  await shot(desktop, "desktop-civil-war-restored-neutral-slate");

  // Northeast zoom — abbreviations at mid zoom, full names deeper
  await desktop.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: "connecticut" },
    });
  });
  await desktop.waitForTimeout(300);
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

  // Collapsed continent legend (default on typical viewports; force if open)
  await zoomWorld(desktop);
  await desktop.evaluate(() => {
    const btn = document.querySelector('[data-testid="continent-legend-toggle"]');
    const aside = document.querySelector('[data-testid="continent-legend"]');
    if (btn && aside && !aside.classList.contains("is-collapsed")) {
      btn.click();
    }
  });
  await desktop.waitForTimeout(200);
  await dismissToast(desktop);
  await shot(desktop, "desktop-civil-war-legend-collapsed");

  // Real News Report after 2–3 AI turns (reachable invasions only — no staged feed)
  await newGame(desktop, "civil_war", 55);
  await prepAiExpansion(desktop);
  await zoomWorld(desktop);
  await dismissToast(desktop);

  let sawCaptureNews = false;
  for (let round = 0; round < 5; round++) {
    await endHumanTurnAndWait(desktop);
    await hastenAiMarches(desktop);
    const info = await desktop.evaluate(() => {
      const s = window.__RF__.getState();
      const digest = s.newsDigest ?? [];
      const feed = s.newsFeed ?? [];
      const items = digest.length ? digest : feed.slice(0, 12);
      const captureish = items.filter(
        (n) =>
          /captur|claims neutral|secured|occupation|invad|march/i.test(
            `${n.headline ?? ""} ${n.body ?? ""}`,
          ),
      );
      const aiOwned = Object.values(s.territories).filter((t) => {
        const p = s.players[t.owner];
        return p?.kind === "ai";
      }).length;
      return {
        digestOpen: digest.length > 0,
        captureish: captureish.map((n) => n.headline),
        phase: s.phase,
        turn: s.turn,
        aiOwned,
        armies: (s.armiesInTransit ?? []).length,
      };
    });
    console.log("after end-turn", round, info);
    if (info.captureish.length > 0 && info.aiOwned > 2) {
      sawCaptureNews = true;
      if (!info.digestOpen) {
        const btn = desktop.getByRole("button", { name: /News/i });
        if (await btn.count()) await btn.first().click();
        await desktop.waitForTimeout(300);
      }
      break;
    }
    if (info.captureish.length > 0 && round >= 2) {
      sawCaptureNews = true;
      if (!info.digestOpen) {
        const btn = desktop.getByRole("button", { name: /News/i });
        if (await btn.count()) await btn.first().click();
        await desktop.waitForTimeout(300);
      }
      break;
    }
    await dismissToast(desktop);
  }

  if (!sawCaptureNews) {
    // Still open news panel if we have feed items from invasions
    const btn = desktop.getByRole("button", { name: /News/i });
    if (await btn.count()) await btn.first().click();
    await desktop.waitForTimeout(300);
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
