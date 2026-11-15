#!/usr/bin/env node
/**
 * Screenshots for gameplay-systems PR: mobile 844×390 + desktop.
 * Starts a real campaign via UI so campaignActive is true.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name);
}

async function waitRF(page) {
  await page.waitForFunction(
    () => window.__RF__ && typeof window.__RF__.createBattle === "function",
    null,
    { timeout: 30000 },
  );
}

async function startCampaign(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(400);
  // Lobby: enable VP + hard
  const vp = page.locator('input[type="checkbox"]');
  if (await vp.count()) await vp.first().check().catch(() => {});
  const diff = page.locator("select");
  if (await diff.count()) await diff.first().selectOption("hard").catch(() => {});
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(800);
  await waitRF(page);
  // Seed a deterministic game while keeping campaign active
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "NEW_GAME",
      payload: {
        humanCount: 1,
        aiCount: 1,
        multiplayerMode: "solo",
        seed: 77,
        difficulty: "hard",
        victoryPointsEnabled: true,
        turnLimit: 40,
      },
    });
  });
  await page.waitForTimeout(600);
}

async function runViewport(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await startCampaign(page);

  // Territory panel — occupied + terrain
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const tid = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    if (!tid) return;
    const ts = s.territories[tid];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          selectedTerritoryId: tid,
          screen: "map",
          phase: "play",
          territories: {
            ...s.territories,
            [tid]: { ...ts, control: "occupied", occupiedTurns: 2 },
          },
        },
      },
    });
  });
  await page.waitForTimeout(500);
  await shot(page, `${tag}-territory-terrain-occupied`);

  // Invade screen
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const from = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          screen: "invade",
          phase: "play",
          selectedTerritoryId: from,
          territories: {
            ...s.territories,
            [from]: {
              ...s.territories[from],
              garrison: { trooper: 14, hover_tank: 2, siege_cannon: 1 },
              garrisonHp: {},
            },
          },
        },
      },
    });
  });
  await page.waitForTimeout(500);
  // Pick a target
  const targetBtns = page.locator(".rf-invade__row .rf-picker__list button");
  if ((await targetBtns.count()) > 0) {
    await targetBtns.first().click().catch(() => {});
  }
  // Increment force
  const plus = page.locator(".rf-invade__stepper button");
  const n = await plus.count();
  for (let i = 0; i < Math.min(n, 8); i++) {
    const btn = plus.nth(i);
    const text = await btn.textContent();
    if (text?.includes("+")) await btn.click().catch(() => {});
  }
  await page.waitForTimeout(400);
  await shot(page, `${tag}-invade-preview-odds-stacking`);

  // Market via HUD
  const marketBtn = page.getByRole("button", { name: /^Market$/i });
  if (await marketBtn.count()) {
    await marketBtn.first().click();
    await page.waitForTimeout(400);
    await shot(page, `${tag}-market`);
    const close = page.locator(".rf-market button.ghost, .rf-market button").filter({ hasText: /Close/i });
    if (await close.count()) await close.first().click().catch(() => {});
  } else {
    // Force market overlay by evaluating React is hard; inject via screen hack
    await page.evaluate(() => {
      // Click path unavailable — open by creating a temporary portal isn't possible.
      // Use SET_SCREEN isn't enough; dispatch a message and leave a note.
      document.body.setAttribute("data-market-missing", "1");
    });
  }

  // Capture raze/keep
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const enemy = Object.entries(s.territories).find(
      ([, t]) => t.owner !== "player",
    )?.[0];
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          phase: "capture",
          screen: "capture",
          battle: null,
          pendingCapture: {
            territoryId: enemy,
            attacker: "player",
            fromId: home,
            survivors: [
              { unitId: "trooper", count: 5, hps: [40, 40, 30, 20, 40] },
            ],
            population: 8,
            workers: 2,
            buildings: s.territories[enemy]?.buildings ?? [],
            supplyStock: 10,
          },
        },
      },
    });
  });
  await page.waitForTimeout(500);
  await shot(page, `${tag}-capture-raze-keep`);

  // Battle HP + retreat
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const enemy = Object.entries(s.territories).find(
      ([, t]) => t.owner !== "player",
    )?.[0];
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    const battle = window.__RF__.createBattle(
      {
        ...s,
        territories: {
          ...s.territories,
          [enemy]: {
            ...s.territories[enemy],
            garrison: { trooper: 3 },
            garrisonHp: {},
          },
        },
      },
      enemy,
      "player",
      [
        { unitId: "trooper", count: 4, hps: [20, 35, 40, 15] },
        { unitId: "hover_tank", count: 1, hps: [60] },
      ],
      home,
    );
    battle.units = battle.units.map((u, i) =>
      u.side === "attacker" && i % 2 === 0
        ? { ...u, hp: Math.max(8, Math.floor(u.maxHp * 0.4)) }
        : u,
    );
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          phase: "battle",
          screen: "battle",
          battle,
          pendingCapture: null,
        },
      },
    });
  });
  await page.waitForTimeout(400);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() =>
      window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.2 } }),
    );
  }
  await page.waitForTimeout(400);
  await shot(page, `${tag}-battle-hp-retreat`);

  // Multi-hop route on map
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const owned = Object.entries(s.territories)
      .filter(([, t]) => t.owner === "player")
      .map(([id]) => id);
    const from = owned[0];
    const n1 = (window.__RF__.neighbors[from] ?? []).find(
      (n) => s.territories[n]?.owner === "player",
    );
    const n2 = n1
      ? (window.__RF__.neighbors[n1] ?? []).find(
          (n) => n !== from && s.territories[n]?.owner === "player",
        )
      : null;
    const path = [from, n1, n2].filter(Boolean);
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          phase: "play",
          screen: "map",
          battle: null,
          plannedRoute: path.length >= 2 ? path : [from, n1].filter(Boolean),
        },
      },
    });
  });
  await page.waitForTimeout(500);
  await shot(page, `${tag}-multihop-route`);

  // Economy summary
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          economySummary: {
            turn: s.turn,
            playerId: "player",
            income: { energy: 120, alloy: 40, research: 6, supply: 12 },
            upkeep: 55,
            net: 40,
            finishedBuildings: ["Fusion Reactor"],
            finishedTraining: ["2× Trooper"],
            finishedResearch: ["Mech Corps"],
          },
        },
      },
    });
  });
  await page.waitForTimeout(400);
  await shot(page, `${tag}-economy-summary`);

  await page.close();
}

async function lobbyShots(browser) {
  for (const [viewport, tag] of [
    [{ width: 1400, height: 900 }, "desktop"],
    [{ width: 844, height: 390 }, "mobile"],
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /New Campaign/i }).click();
    await page.waitForTimeout(400);
    const vp = page.locator('input[type="checkbox"]');
    if (await vp.count()) await vp.first().check().catch(() => {});
    const diff = page.locator("select");
    if (await diff.count()) await diff.first().selectOption("hard").catch(() => {});
    await page.waitForTimeout(250);
    await shot(page, `${tag}-lobby-vp-difficulty`);
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
await lobbyShots(browser);
await runViewport(browser, { width: 1400, height: 900 }, "desktop");
await runViewport(browser, { width: 844, height: 390 }, "mobile");
await browser.close();
console.log("done");
