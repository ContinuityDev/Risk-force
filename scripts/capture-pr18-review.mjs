#!/usr/bin/env node
/** One-pass 844×390 review shots for PR #18. */
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
        seed: 7,
        doctrineId: "vanguard",
        mapId: "world_war",
      },
    });
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_ECONOMY_SUMMARY" });
  });
  await page.waitForTimeout(250);
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  await boot(page);
  const ids = await prep(page);
  console.log("ids", ids);

  // 1) Territory sheet + buildings list
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  }, ids.home);
  await page.waitForTimeout(80);
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, ids.home);
  await page.waitForTimeout(400);
  await page.waitForSelector('[data-testid="territory-buildings"]');
  await shot(page, "mobile-territory-buildings.png");

  // 2) Barracks Train + queue
  await page.getByTestId("build-row-barracks").scrollIntoViewIfNeeded();
  await page.getByTestId("build-row-barracks").click({ force: true });
  await page.waitForTimeout(300);
  await page.waitForSelector('[data-testid="building-popover"]');
  await page.getByRole("menuitem", { name: /Train unit/i }).click({ force: true });
  await page.waitForTimeout(200);
  await page.getByTestId("train-trooper").click({ force: true });
  await page.waitForTimeout(250);
  await page.getByTestId("train-queue").scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "mobile-barracks-train.png");

  // 3) Squad selected on map (minis + selection)
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
      if (squadId && enemy) {
        window.__RF__.dispatch({
          type: "ORDER_SQUAD_MOVE",
          payload: { squadId, toId: enemy },
        });
        window.__RF__.dispatch({
          type: "SELECT_SQUAD",
          payload: { squadId },
        });
      }
      window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
      window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    },
    { home: ids.home, enemy: ids.enemy },
  );
  await page.waitForTimeout(450);
  await shot(page, "mobile-selected-squad-route.png");
  const hit = page.locator("[data-squad-id].rf-map__squad-hit").first();
  if (await hit.count()) {
    const box = await hit.boundingBox();
    if (box) {
      await page.screenshot({
        path: join(OUT, "mobile-squad-tap-select.png"),
        clip: {
          x: Math.max(0, box.x - 72),
          y: Math.max(0, box.y - 72),
          width: Math.min(844 - Math.max(0, box.x - 72), 180),
          height: Math.min(390 - Math.max(0, box.y - 72), 160),
        },
      });
      console.log("saved", join(OUT, "mobile-squad-tap-select.png"));
    }
  }

  // 4) Pending join — sheet only, no dock duplicate
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
  const dockCount = await page.locator('[data-testid="squad-dock"]').count();
  console.log("pending-join dockCount (expect 0)", dockCount);
  await shot(page, "mobile-pending-join.png");

  // 5) Capture — toast must not show
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
            selectedTerritoryId: null,
          },
        },
      });
    },
    { home: ids.home, enemy: ids.enemy },
  );
  await page.waitForTimeout(350);
  const toast = await page.evaluate(
    () => !!document.querySelector(".rf-hud__toast, .rf-hud__message"),
  );
  console.log("capture toast in DOM (expect false)", toast);
  await shot(page, "mobile-capture-sheet.png");

  // Indonesia zoom minis (sheet closed)
  await prep(page);
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, ids.home);
  await page.waitForTimeout(350);
  const close = page.getByTestId("territory-sheet-close");
  if (await close.count()) await close.click({ force: true });
  await page.waitForTimeout(250);
  const minis = await page.evaluate(() => ({
    images: document.querySelectorAll(".rf-map__svg image").length,
    bldg: document.querySelector(".rf-map__bldgs")?.childElementCount ?? 0,
    units: document.querySelector(".rf-map__units")?.childElementCount ?? 0,
  }));
  console.log("indonesia minis", minis);
  await shot(page, "mobile-indonesia-zoom-minis.png");

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
