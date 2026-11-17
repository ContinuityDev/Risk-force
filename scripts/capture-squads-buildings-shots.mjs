#!/usr/bin/env node
/**
 * Map-first PR screenshots for #18 — mobile 844×390 first, then desktop.
 */
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
        buildings: territories[friend].buildings ?? [],
      };
    }
    const homeTs = territories[home];
    const buildings = [...(homeTs.buildings ?? [])].map((b) =>
      b.buildingId === "command_nexus" || b.buildingId === "barracks"
        ? { ...b, buildRemaining: 0, hp: Math.max(b.hp, 200) }
        : b,
    );
    if (!buildings.some((b) => b.buildingId === "barracks")) {
      buildings.push({
        instanceId: "shot_barracks",
        buildingId: "barracks",
        x: 2,
        y: 1,
        hp: 260,
        buildRemaining: 0,
        workers: 0,
      });
    }
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
              buildings,
            },
          },
          selectedTerritoryId: null,
          selectedSquadId: null,
          squads: [],
          armiesInTransit: [],
          message: null,
          screen: "map",
          phase: "play",
          pendingCapture: null,
        },
      },
    });
    return { home, enemy, friend };
  });
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: false });
  console.log("saved", path);
}

async function captureViewport(browser, tag, viewport) {
  const page = await browser.newPage({
    viewport,
    isMobile: viewport.height <= 430,
    hasTouch: viewport.height <= 430,
  });
  await boot(page);
  const ids = await prep(page);

  // 1) Territory sheet with buildings
  await page.evaluate((home) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
  }, ids.home);
  await page.waitForTimeout(400);
  await shot(page, `${tag}-territory-buildings.png`);

  // 2) Barracks popover with Train / Workers / Info / Delete
  await page.evaluate((home) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
  }, ids.home);
  await page.waitForTimeout(350);
  const buildingsBtn = page.getByTestId("sheet-buildings-btn");
  if (await buildingsBtn.count()) {
    await buildingsBtn.click({ force: true });
    await page.waitForTimeout(200);
  }
  const barracksRow = page.getByTestId("build-row-barracks");
  if (await barracksRow.count()) {
    await barracksRow.click({ force: true });
    await page.waitForTimeout(300);
  } else {
    // Open popover via map building instance id
    await page.evaluate((home) => {
      const st = window.__RF__.getState();
      const b = st.territories[home].buildings.find(
        (x) => x.buildingId === "barracks",
      );
      if (!b) return;
      // Select territory; popover is opened by clicking the build row in UI.
      console.log("barracks", b.instanceId);
    }, ids.home);
  }
  await shot(page, `${tag}-barracks-menu.png`);

  // Train a unit through the popover if open
  const trainItem = page.getByRole("menuitem", { name: /Train unit/i });
  if (await trainItem.count()) {
    await trainItem.click({ force: true });
    await page.waitForTimeout(200);
    const trainTrooper = page.getByTestId("train-trooper");
    if (await trainTrooper.count()) {
      await trainTrooper.click({ force: true });
      await page.waitForTimeout(200);
    }
  } else {
    await page.evaluate((home) => {
      window.__RF__.dispatch({
        type: "TRAIN_UNIT",
        payload: { territoryId: home, unitId: "trooper", count: 1 },
      });
    }, ids.home);
  }
  await shot(page, `${tag}-barracks-train.png`);

  // 3) Create squad sheet — dismiss building popover first
  await page.locator(".rf-bldg-pop__close").click({ force: true }).catch(() => {});
  await page.evaluate((home) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
  }, ids.home);
  await page.waitForTimeout(250);
  const createBtn = page.getByTestId("create-squad-btn");
  if (await createBtn.count()) {
    await createBtn.click({ force: true });
    await page.waitForTimeout(400);
  }
  // Ensure unit steppers are in view
  await page
    .locator("[data-testid='create-squad-panel']")
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    })
    .catch(() => {});
  await page.waitForTimeout(150);
  await shot(page, `${tag}-create-squad.png`);

  // 4) Create Core squad, select, march → selected route
  await prep(page);
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
      if (squadId) {
        window.__RF__.dispatch({
          type: "SELECT_SQUAD",
          payload: { squadId },
        });
        if (enemy) {
          window.__RF__.dispatch({
            type: "ORDER_SQUAD_MOVE",
            payload: { squadId, toId: enemy },
          });
          // Keep selection to show route + mini
          window.__RF__.dispatch({
            type: "SELECT_SQUAD",
            payload: { squadId },
          });
        }
      }
      window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    },
    { home: ids.home, enemy: ids.enemy },
  );
  await page.waitForTimeout(450);
  await shot(page, `${tag}-selected-squad-route.png`);

  // 5) Pending join + dock
  await prep(page);
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
      window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
      window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    },
    { home: ids.home, friend: ids.friend },
  );
  await page.waitForTimeout(450);
  await shot(page, `${tag}-pending-join.png`);
  await shot(page, `${tag}-squad-dock.png`);

  // 6) Capture sheet over map — captured enemy, not origin
  await page.evaluate(
    ({ home, enemy }) => {
      const st = window.__RF__.getState();
      const target = enemy || "papua_new_guinea";
      window.__RF__.dispatch({
        type: "LOAD_STATE",
        payload: {
          state: {
            ...st,
            phase: "capture",
            screen: "capture",
            pendingCapture: {
              territoryId: target,
              attacker: "player",
              fromId: home,
              survivors: [{ unitId: "trooper", count: 4 }],
              population: 8,
              workers: 2,
              buildings: st.territories[target]?.buildings ?? [],
              supplyStock: 10,
            },
            message: "Captured — choose occupation strength.",
            selectedSquadId: null,
          },
        },
      });
    },
    { home: ids.home, enemy: ids.enemy },
  );
  await page.waitForTimeout(400);
  await shot(page, `${tag}-capture-sheet.png`);

  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await captureViewport(browser, "mobile", {
    width: 844,
    height: 390,
  });
  await captureViewport(browser, "desktop", {
    width: 1440,
    height: 900,
  });
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
