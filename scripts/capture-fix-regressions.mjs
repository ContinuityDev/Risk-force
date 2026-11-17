#!/usr/bin/env node
/** Mobile screenshots: build list, selected squad, worker training. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

async function boot(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    try {
      for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? [])
        await r.unregister();
    } catch {
      /* */
    }
  });
  await page.reload({ waitUntil: "networkidle" });
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForSelector('[data-testid="map-picker"]');
  await page.getByTestId("map-world_war").click();
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForFunction(() => window.__RF__?.dispatch);
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "NEW_GAME",
      payload: {
        humanCount: 1,
        aiCount: 1,
        multiplayerMode: "solo",
        seed: 42,
        doctrineId: "vanguard",
        mapId: "world_war",
      },
    });
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_ECONOMY_SUMMARY" });
  });
  await page.waitForTimeout(250);
}

async function stock(page) {
  return page.evaluate(() => {
    const s = window.__RF__.getState();
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    const territories = { ...s.territories };
    const ts = territories[home];
    let buildings = [...(ts.buildings ?? [])].map((b) => ({
      ...b,
      buildRemaining: 0,
      hp: Math.max(b.hp, 200),
    }));
    if (!buildings.some((b) => b.buildingId === "command_nexus")) {
      buildings.unshift({
        instanceId: "shot_nexus",
        buildingId: "command_nexus",
        x: 0,
        y: 0,
        hp: 900,
        buildRemaining: 0,
        workers: 0,
      });
    }
    territories[home] = {
      ...ts,
      buildings,
      garrison: { trooper: 8, assault_mech: 2 },
      population: 28,
      workers: 5,
      supplyStock: 40,
      trainingQueue: [],
    };
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              resources: {
                ...s.players.player.resources,
                energy: 900,
                alloy: 400,
                supply: 120,
              },
            },
          },
          selectedTerritoryId: null,
          selectedSquadId: null,
          squads: [],
          armiesInTransit: [],
          message: null,
          newsDigest: null,
          screen: "map",
          phase: "play",
        },
      },
    });
    return home;
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  await boot(page);
  const home = await stock(page);

  // 1) Build list
  await page.evaluate((id) => {
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: id } });
  }, home);
  await page.waitForTimeout(300);
  await page.getByTestId("sheet-build-btn").click();
  await page.waitForSelector('[data-testid="territory-build-catalog"]');
  await page.screenshot({
    path: join(OUT, "mobile-build-catalog.png"),
    fullPage: false,
  });
  console.log("saved mobile-build-catalog.png");

  // 2) Selected squad
  await page.evaluate((id) => {
    window.__RF__.dispatch({
      type: "CREATE_SQUAD",
      payload: {
        territoryId: id,
        force: [{ unitId: "trooper", count: 4 }],
        name: "Alpha",
      },
    });
    const sid = window.__RF__.getState().squads[0].id;
    window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: sid } });
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: id } });
  }, home);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(OUT, "mobile-selected-squad.png"),
    fullPage: false,
  });
  console.log("saved mobile-selected-squad.png");

  // 3) Worker training
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: null } });
  });
  await page.evaluate((id) => {
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: id } });
  }, home);
  await page.waitForTimeout(200);
  await page.getByTestId("sheet-buildings-btn").click();
  await page.waitForTimeout(150);
  const nexus = page.locator('[data-testid="build-row-command_nexus"]').first();
  await nexus.click();
  await page.waitForSelector('[data-testid="building-popover"]');
  await page.getByTestId("building-train-btn").click();
  await page.waitForSelector('[data-testid="train-worker"]');
  await page.screenshot({
    path: join(OUT, "mobile-train-worker.png"),
    fullPage: false,
  });
  console.log("saved mobile-train-worker.png");

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
