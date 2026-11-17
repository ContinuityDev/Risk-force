#!/usr/bin/env node
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
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs) for (const r of regs) await r.unregister();
      const keys = await caches?.keys?.();
      if (keys) for (const k of keys) await caches.delete(k);
    } catch {
      /* */
    }
  });
  await page.reload({ waitUntil: "networkidle" });
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(300);
  await page.waitForSelector('[data-testid="map-picker"]');
  await page.getByTestId("map-world_war").click();
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(500);
  await page.waitForFunction(() => window.__RF__?.dispatch);
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "NEW_GAME",
      payload: {
        humanCount: 1,
        aiCount: 1,
        multiplayerMode: "solo",
        seed: 7,
        doctrineId: "vanguard",
        mapId: "world_war",
      },
    });
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_ECONOMY_SUMMARY" });
  });
  await page.waitForTimeout(300);
}

async function dismissUi(page) {
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_ECONOMY_SUMMARY" });
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
    window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: null } });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
  });
  const backdrop = page.locator('[aria-label="Close panel"]');
  if (await backdrop.count()) {
    await backdrop.first().click({ force: true }).catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
}

async function prep(page) {
  return page.evaluate(() => {
    const s = window.__RF__.getState();
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )[0];
    const neighbors = window.__RF__.neighbors?.[home] ?? [];
    const enemy = neighbors.find((n) => s.territories[n]?.owner !== "player");
    const friend = neighbors.find((n) => n !== enemy);
    const territories = { ...s.territories };
    if (friend) {
      territories[friend] = {
        ...territories[friend],
        owner: "player",
        garrison: { trooper: 4 },
        garrisonHp: {},
        control: "occupied",
        occupiedTurns: 1,
        trainingQueue: [],
      };
    }
    const homeTs = territories[home];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories: {
            ...territories,
            [home]: {
              ...homeTs,
              garrison: { trooper: 12, assault_mech: 2 },
              workers: 20,
              population: 25,
              buildings: homeTs.buildings.map((b) =>
                b.buildingId === "command_nexus"
                  ? { ...b, workers: 0, buildRemaining: 0 }
                  : b,
              ),
            },
          },
          selectedTerritoryId: null,
          selectedSquadId: null,
          squads: [],
          armiesInTransit: [],
          message: null,
          screen: "map",
          phase: "play",
        },
      },
    });
    return { home, enemy, friend };
  });
}

async function shot(page, name) {
  const path = join(OUT, `squads-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log("saved", path);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await boot(page);
  const ids = await prep(page);
  await dismissUi(page);

  // Create squad panel: select home then force-open via create button
  await page.evaluate((home) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
  }, ids.home);
  await page.waitForTimeout(250);
  const createBtn = page.getByTestId("create-squad-btn");
  if (await createBtn.count()) {
    await createBtn.click({ force: true });
    await page.waitForTimeout(250);
    await shot(page, "create-panel");
    await page.keyboard.press("Escape").catch(() => {});
    await dismissUi(page);
  }

  // Create Vanguard + show selected route
  await page.evaluate(
    ({ home, enemy }) => {
      window.__RF__.dispatch({
        type: "CREATE_SQUAD",
        payload: {
          territoryId: home,
          force: [
            { unitId: "trooper", count: 5 },
            { unitId: "assault_mech", count: 1 },
          ],
          name: "Vanguard",
        },
      });
      const squadId = window.__RF__.getState().squads[0]?.id;
      if (squadId && enemy) {
        window.__RF__.dispatch({
          type: "SELECT_SQUAD",
          payload: { squadId },
        });
        window.__RF__.dispatch({
          type: "ORDER_SQUAD_MOVE",
          payload: { squadId, toId: enemy },
        });
      }
      window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    },
    { home: ids.home, enemy: ids.enemy },
  );
  await page.waitForTimeout(300);
  await shot(page, "selected-route");

  // Pending join on map
  await prep(page);
  await dismissUi(page);
  await page.evaluate(
    ({ home, friend }) => {
      window.__RF__.dispatch({
        type: "CREATE_SQUAD",
        payload: {
          territoryId: home,
          force: [{ unitId: "trooper", count: 3 }],
          name: "Core",
        },
      });
      const squadId = window.__RF__.getState().squads.find(
        (s) => s.name === "Core",
      )?.id;
      if (squadId && friend) {
        window.__RF__.dispatch({
          type: "ADD_TO_SQUAD",
          payload: {
            squadId,
            fromId: friend,
            force: [{ unitId: "trooper", count: 2 }],
          },
        });
        window.__RF__.dispatch({
          type: "SELECT_SQUAD",
          payload: { squadId },
        });
      }
      window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    },
    { home: ids.home, friend: ids.friend },
  );
  await page.waitForTimeout(350);
  await shot(page, "pending-join");

  // Squads tab (list + joining group)
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "squads" } });
  });
  await page.waitForTimeout(400);
  await shot(page, "tab");

  // Building menu on base
  await page.evaluate((home) => {
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "base" } });
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
  }, ids.home);
  await page.waitForTimeout(450);
  const structure = page.locator(".rf-base__structure").first();
  if (await structure.count()) {
    await structure.click({ force: true });
    await page.waitForTimeout(250);
  }
  await shot(page, "building-menu");

  const workersBtn = page.getByRole("menuitem", { name: /Workers/i });
  if (await workersBtn.count()) {
    await workersBtn.click({ force: true });
    await page.waitForTimeout(200);
    await page.evaluate((home) => {
      const st = window.__RF__.getState();
      const nexus = st.territories[home].buildings.find(
        (b) => b.buildingId === "command_nexus",
      );
      if (nexus) {
        window.__RF__.dispatch({
          type: "ASSIGN_WORKERS",
          payload: {
            territoryId: home,
            instanceId: nexus.instanceId,
            workers: 2,
          },
        });
      }
    }, ids.home);
    await page.waitForTimeout(200);
  }
  await shot(page, "workers-effect");

  // Capture result screen
  await page.evaluate((home) => {
    const st = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...st,
          phase: "capture",
          screen: "capture",
          pendingCapture: {
            territoryId: home,
            attacker: "player",
            fromId: home,
            survivors: [{ unitId: "trooper", count: 4 }],
            population: 8,
            workers: 2,
            buildings: st.territories[home].buildings,
            supplyStock: 10,
          },
          message: "Captured — choose occupation strength.",
        },
      },
    });
  }, ids.home);
  await page.waitForTimeout(350);
  await shot(page, "capture-result");

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
