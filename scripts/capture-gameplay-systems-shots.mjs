#!/usr/bin/env node
/**
 * Screenshots for gameplay-systems PR: mobile 844×390 + desktop.
 * Each shot dismisses toasts and frames the feature clearly.
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
    () =>
      window.__RF__ &&
      typeof window.__RF__.createBattle === "function" &&
      Object.keys(window.__RF__.neighbors ?? {}).length > 0,
    null,
    { timeout: 30000 },
  );
}

async function dismissToast(page) {
  await page.evaluate(() => {
    window.__RF__?.dismissMessage?.();
    window.__RF__?.dispatch?.({ type: "DISMISS_MESSAGE" });
  });
  await page.waitForTimeout(150);
}

async function startCampaign(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(400);
  const vp = page.locator('input[type="checkbox"]');
  if (await vp.count()) await vp.first().check().catch(() => {});
  const diff = page.locator("select");
  if (await diff.count()) await diff.first().selectOption("hard").catch(() => {});
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(800);
  await waitRF(page);
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
  await page.waitForTimeout(500);
  await dismissToast(page);
}

async function runViewport(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await startCampaign(page);

  // 0) Fresh-game HUD at turn 1 (no garrison inflation) + dock chrome
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          message: null,
          screen: "map",
          phase: "play",
          selectedTerritoryId: null,
          economySummary: null,
        },
      },
    });
  });
  await page.waitForTimeout(400);
  await dismissToast(page);
  await shot(page, `${tag}-fresh-hud-turn1`);
  await shot(page, `${tag}-dock`);

  // 1) Territory panel — occupied + terrain
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
          message: null,
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
  await dismissToast(page);
  await shot(page, `${tag}-territory-terrain-occupied`);

  // 2) Invade screen with force + sticky forecast/odds
  const invadeSetup = await page.evaluate(() => {
    const s = window.__RF__.getState();
    const neighbors = window.__RF__.neighbors;
    // Prefer a player territory that borders an enemy
    let from = null;
    let enemy = null;
    for (const [id, t] of Object.entries(s.territories)) {
      if (t.owner !== "player") continue;
      const hit = (neighbors[id] ?? []).find(
        (n) => s.territories[n]?.owner !== "player",
      );
      if (hit) {
        from = id;
        enemy = hit;
        break;
      }
    }
    if (!from) {
      from = Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0];
    }
    // Only inflate the strike origin — boosting every owned territory
    // created the fake −1030/t HUD burn in earlier screenshots.
    const territories = { ...s.territories };
    if (from && territories[from]) {
      territories[from] = {
        ...territories[from],
        garrison: {
          trooper: 14,
          hover_tank: 2,
          siege_cannon: 1,
        },
        garrisonHp: {},
      };
    }
    if (enemy && territories[enemy]) {
      territories[enemy] = {
        ...territories[enemy],
        garrison: { trooper: 5, hover_tank: 1 },
        garrisonHp: {},
      };
    }
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          message: null,
          screen: "invade",
          phase: "play",
          selectedTerritoryId: from,
          plannedRoute: null,
          territories,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              resources: {
                ...s.players.player.resources,
                supply: 120,
                energy: 520,
              },
              researched: [
                ...new Set([
                  ...(s.players.player.researched ?? []),
                  "mech_corps",
                  "grav_armor",
                  "plasma_doctrine",
                  "siege_protocols",
                ]),
              ],
            },
          },
        },
      },
    });
    return { from, enemy };
  });
  await page.waitForTimeout(500);
  await dismissToast(page);

  // Click launch-from with large garrison (force:true — avoid actionability hangs)
  const fromBtns = page.locator(".rf-invade__row .rf-picker").nth(0).locator(".rf-picker__list button");
  const fromCount = await fromBtns.count();
  let clickedFrom = false;
  for (let i = 0; i < fromCount; i++) {
    const label = (await fromBtns.nth(i).textContent()) ?? "";
    if (/Garrison\s(1[0-9]|[2-9]\d)/i.test(label)) {
      await fromBtns.nth(i).click({ force: true });
      clickedFrom = true;
      break;
    }
  }
  if (!clickedFrom && fromCount > 0) {
    await fromBtns.first().click({ force: true });
  }
  await page.waitForTimeout(200);

  // Click first enemy target
  const targetBtns = page
    .locator(".rf-invade__row .rf-picker")
    .nth(1)
    .locator(".rf-picker__list button");
  if ((await targetBtns.count()) > 0) {
    await targetBtns.first().click({ force: true });
  }
  await page.waitForTimeout(200);

  // Raise force on every row — stop when + disables (never await a disabled click)
  const steppers = page.locator(".rf-invade__stepper");
  const stepCount = await steppers.count();
  for (let s = 0; s < stepCount; s++) {
    const plusBtn = steppers.nth(s).locator("button").last();
    for (let k = 0; k < 16; k++) {
      if (await plusBtn.isDisabled().catch(() => true)) break;
      await plusBtn.click({ force: true });
    }
  }
  await page.waitForTimeout(300);
  await page.locator(".rf-invade__footer").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);
  console.log("invade setup", invadeSetup);
  await shot(page, `${tag}-invade-preview-odds-stacking`);

  // 3) Market open with trade preview
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...window.__RF__.getState(),
          message: null,
          screen: "map",
          phase: "play",
        },
      },
    });
  });
  await page.waitForTimeout(200);
  await dismissToast(page);

  const marketDock = page.locator('[data-tutorial="dock-market"]');
  const marketHud = page.getByRole("button", { name: /^Market$/i });
  const dockVisible = await marketDock.first().isVisible().catch(() => false);
  const hudVisible = await marketHud.first().isVisible().catch(() => false);
  if (dockVisible) {
    await marketDock.first().click();
  } else if (hudVisible) {
    await marketHud.first().click();
  } else {
    const more = page.getByRole("button", { name: /^More$/i });
    if (await more.first().isVisible().catch(() => false)) {
      await more.first().click();
      await page.waitForTimeout(200);
      const orbital = page.getByRole("button", { name: /Orbital Market/i });
      if (await orbital.first().isVisible().catch(() => false)) {
        await orbital.first().click();
      } else {
        await page.evaluate(() => window.__RF__.openMarket?.());
      }
    } else {
      await page.evaluate(() => window.__RF__.openMarket?.());
    }
  }
  await page.waitForTimeout(400);
  // Ensure preview visible — set amount
  const amount = page.locator(".rf-market input[type='number']");
  if (await amount.count()) {
    await amount.fill("25");
  }
  await page.waitForTimeout(200);
  await shot(page, `${tag}-market`);
  const close = page
    .locator(".rf-market button")
    .filter({ hasText: /Close/i });
  if (await close.count()) await close.first().click().catch(() => {});
  await page.waitForTimeout(200);

  // 4) Capture raze/keep with structures + reachable confirm
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const enemy = Object.entries(s.territories).find(
      ([, t]) => t.owner !== "player",
    )?.[0];
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    const buildings = [
      {
        instanceId: "cap-b1",
        buildingId: "reactor",
        x: 1,
        y: 1,
        hp: 80,
        buildRemaining: 0,
        workers: 1,
      },
      {
        instanceId: "cap-b2",
        buildingId: "barracks",
        x: 2,
        y: 1,
        hp: 60,
        buildRemaining: 0,
        workers: 0,
      },
      {
        instanceId: "cap-b3",
        buildingId: "supply_depot",
        x: 3,
        y: 1,
        hp: 40,
        buildRemaining: 0,
        workers: 1,
      },
    ];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          message: null,
          phase: "capture",
          screen: "capture",
          battle: null,
          pendingCapture: {
            territoryId: enemy,
            attacker: "player",
            fromId: home,
            survivors: [
              { unitId: "trooper", count: 5, hps: [40, 40, 30, 20, 40] },
              { unitId: "hover_tank", count: 1, hps: [70] },
            ],
            population: 8,
            workers: 2,
            buildings,
            supplyStock: 10,
          },
        },
      },
    });
  });
  await page.waitForTimeout(500);
  await dismissToast(page);
  await page.locator(".rf-capture__panel > .primary").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);
  await shot(page, `${tag}-capture-raze-keep`);

  // 5) Battle HP + retreat + legend
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
          message: null,
          phase: "battle",
          screen: "battle",
          battle,
          pendingCapture: null,
        },
      },
    });
  });
  await page.waitForTimeout(300);
  await dismissToast(page);
  // Light ticks for motion; then pause so floaters settle into one-per-target
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() =>
      window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.15 } }),
    );
  }
  await page.waitForTimeout(700);
  await dismissToast(page);
  await shot(page, `${tag}-battle-hp-retreat`);

  // 6) Multi-hop route on map with line + turns badge
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const neighbors = window.__RF__.neighbors;
    const owned = Object.entries(s.territories)
      .filter(([, t]) => t.owner === "player")
      .map(([id]) => id);

    let path = null;
    for (const a of owned) {
      for (const b of neighbors[a] ?? []) {
        if (s.territories[b]?.owner !== "player") continue;
        for (const c of neighbors[b] ?? []) {
          if (c === a) continue;
          if (s.territories[c]?.owner !== "player") continue;
          path = [a, b, c];
          break;
        }
        if (path) break;
      }
      if (path) break;
    }

    // Claim a contiguous neighbor chain if player doesn't already own one
    const territories = { ...s.territories };
    if (!path) {
      const a = owned[0];
      const b = (neighbors[a] ?? [])[0];
      const c = b
        ? (neighbors[b] ?? []).find((n) => n !== a)
        : null;
      path = [a, b, c].filter(Boolean);
      for (const id of path) {
        if (!id) continue;
        territories[id] = {
          ...territories[id],
          owner: "player",
          control: territories[id]?.control ?? "core",
        };
      }
    }

    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          message: null,
          phase: "play",
          screen: "map",
          battle: null,
          pendingCapture: null,
          economySummary: null,
          territories,
          plannedRoute: path.length >= 2 ? path : null,
          selectedTerritoryId: path[0] ?? null,
        },
      },
    });
  });
  await page.waitForTimeout(400);
  await dismissToast(page);
  // Clear selection so the territory drawer doesn't cover the route line
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          message: null,
          selectedTerritoryId: null,
          screen: "map",
          phase: "play",
        },
      },
    });
  });
  await page.waitForTimeout(350);
  await dismissToast(page);
  await shot(page, `${tag}-multihop-route`);

  // 7) Economy summary
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          message: null,
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
  await dismissToast(page);
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
