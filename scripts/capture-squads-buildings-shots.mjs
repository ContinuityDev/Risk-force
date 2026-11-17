#!/usr/bin/env node
/**
 * Map-first PR screenshots for #18 — mobile 844×390 first, then desktop.
 * Verifies grounded minis, bottom territory sheet, barracks actions,
 * squad dock / sheet separation, and capture toast hiding.
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

async function focusHome(page, home) {
  // Clear then reselect so the short-landscape sheet reopens even if
  // the same territory was already selected.
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
    window.__RF__.dispatch({
      type: "SELECT_SQUAD",
      payload: { squadId: null },
    });
  }, home);
  await page.waitForTimeout(80);
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
  }, home);
  await page.waitForTimeout(450);
}

async function captureViewport(browser, tag, viewport) {
  const page = await browser.newPage({
    viewport,
    isMobile: viewport.height <= 430,
    hasTouch: viewport.height <= 430,
  });
  await boot(page);
  const ids = await prep(page);
  console.log(tag, "home", ids.home, "enemy", ids.enemy, "friend", ids.friend);

  // 0) Zoomed Indonesia / home with building + unit minis (sheet closed)
  await focusHome(page, ids.home);
  const sheetClose = page.getByTestId("territory-sheet-close");
  if (await sheetClose.count()) {
    await sheetClose.click({ force: true });
    await page.waitForTimeout(250);
  }
  const miniCount = await page.evaluate(() => ({
    bldg: document.querySelector(".rf-map__bldgs")?.childElementCount ?? 0,
    units: document.querySelector(".rf-map__units")?.childElementCount ?? 0,
    squads: document.querySelector(".rf-map__squads")?.childElementCount ?? 0,
    images: document.querySelectorAll(".rf-map__svg image").length,
    sheetOpen: !!document.querySelector(".rf-map__territory-drawer"),
  }));
  console.log(tag, "miniCount", miniCount);
  await shot(page, `${tag}-indonesia-zoom-minis.png`);

  // 1) Territory sheet with buildings list
  await focusHome(page, ids.home);
  const buildingsBtn = page.getByTestId("sheet-buildings-btn");
  if (await buildingsBtn.count()) {
    await buildingsBtn.click({ force: true });
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('[data-testid="territory-buildings"]', {
    timeout: 4000,
  });
  // Scroll building list so multiple rows / barracks are in view
  await page
    .locator('[data-testid="territory-buildings"]')
    .evaluate((el) => {
      el.scrollTop = 0;
    })
    .catch(() => {});
  await page.waitForTimeout(150);
  await shot(page, `${tag}-territory-buildings.png`);

  // 2) Barracks menu (embedded on short landscape)
  const barracksRow = page.getByTestId("build-row-barracks");
  await barracksRow.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);
  if (await barracksRow.count()) {
    await barracksRow.click({ force: true });
  } else {
    // Fallback: open building action via sheet section dispatch path
    await page.evaluate((home) => {
      const st = window.__RF__.getState();
      const b = st.territories[home]?.buildings?.find(
        (x) => x.buildingId === "barracks",
      );
      console.log("barracks missing in sheet", !!b, b?.instanceId);
    }, ids.home);
  }
  await page.waitForTimeout(400);
  const pop = page.getByTestId("building-popover");
  if (!(await pop.count())) {
    // Force embedded sheet by re-clicking buildings then barracks
    const bBtn = page.getByTestId("sheet-buildings-btn");
    if (await bBtn.count()) await bBtn.click({ force: true });
    await page.waitForTimeout(200);
    await page.getByTestId("build-row-barracks").click({ force: true }).catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.waitForSelector('[data-testid="building-popover"]', {
    timeout: 6000,
  });
  // Ensure Delete is reachable
  await page
    .getByTestId("building-delete")
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await page.waitForTimeout(150);
  await shot(page, `${tag}-barracks-menu.png`);

  // 3) Train options + queue after Train
  const trainItem = page.getByRole("menuitem", { name: /Train unit/i });
  if (await trainItem.count()) {
    await trainItem.click({ force: true });
    await page.waitForTimeout(200);
  }
  const trainTrooper = page.getByTestId("train-trooper");
  if (await trainTrooper.count()) {
    await trainTrooper.click({ force: true });
    await page.waitForTimeout(250);
  } else {
    await page.evaluate((home) => {
      window.__RF__.dispatch({
        type: "TRAIN_UNIT",
        payload: { territoryId: home, unitId: "trooper", count: 1 },
      });
    }, ids.home);
    await page.waitForTimeout(200);
  }
  await page
    .getByTestId("train-queue")
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await page
    .locator(".rf-bldg-pop__train-list")
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    })
    .catch(() => {});
  await page.waitForTimeout(150);
  await shot(page, `${tag}-barracks-train.png`);

  // 4) Create squad sheet — no duplicate Create buttons
  await page.locator(".rf-bldg-pop__close").click({ force: true }).catch(() => {});
  await focusHome(page, ids.home);
  const createBtn = page.getByTestId("create-squad-btn");
  if (await createBtn.count()) {
    await createBtn.click({ force: true });
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('[data-testid="create-squad-panel"]', {
    timeout: 4000,
  });
  await page
    .locator("[data-testid='create-squad-panel']")
    .evaluate((el) => {
      el.scrollTop = 0;
    })
    .catch(() => {});
  await page.waitForTimeout(100);
  // Add one unit so Create is enabled / visible with count
  const plus = page.locator(".rf-invade__stepper button").nth(1);
  if (await plus.count()) await plus.click({ force: true }).catch(() => {});
  await page
    .locator(".rf-squads__create-footer")
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await page.waitForTimeout(150);
  await shot(page, `${tag}-create-squad.png`);

  // 5) Create Core + Vanguard march — selected route with minis
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
          window.__RF__.dispatch({
            type: "SELECT_SQUAD",
            payload: { squadId },
          });
        }
      }
      window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
      window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
    },
    { home: ids.home, enemy: ids.enemy },
  );
  await page.waitForTimeout(500);
  await page.waitForSelector('[data-testid="squad-marker"], [data-testid="map-squad-sheet"]', {
    timeout: 4000,
  }).catch(() => {});
  await shot(page, `${tag}-selected-squad-route.png`);

  // 5b) Tap-select crop: idle Core mini → selection ring + sheet
  await prep(page);
  await page.evaluate((home) => {
    window.__RF__.dispatch({
      type: "CREATE_SQUAD",
      payload: {
        territoryId: home,
        force: [
          { unitId: "trooper", count: 4 },
          { unitId: "assault_mech", count: 1 },
        ],
        name: "Core",
      },
    });
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
  }, ids.home);
  await page.waitForTimeout(450);
  // Deselect territory so the sheet does not cover the squad mini
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await page.waitForTimeout(200);

  const squadHit = page.locator("[data-squad-id].rf-map__squad-hit").first();
  if (await squadHit.count()) {
    const box = await squadHit.boundingBox();
    await squadHit.click({ force: true });
    await page.waitForTimeout(350);
    if (box) {
      const pad = 72;
      await page.screenshot({
        path: join(OUT, `${tag}-squad-tap-select.png`),
        clip: {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
          width: Math.min(viewport.width - Math.max(0, box.x - pad), pad * 2 + box.width),
          height: Math.min(
            viewport.height - Math.max(0, box.y - pad),
            pad * 2 + box.height + 40,
          ),
        },
      });
      console.log("saved", join(OUT, `${tag}-squad-tap-select.png`));
    } else {
      await shot(page, `${tag}-squad-tap-select.png`);
    }
  } else {
    // Fallback: select via action and crop map center
    await page.evaluate(() => {
      const sid = window.__RF__.getState().squads[0]?.id;
      if (sid) {
        window.__RF__.dispatch({
          type: "SELECT_SQUAD",
          payload: { squadId: sid },
        });
      }
    });
    await page.waitForTimeout(300);
    await shot(page, `${tag}-squad-tap-select.png`);
  }

  // 6) Pending join — dock collapsed, squad sheet only when selected
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

  // Dock alone (collapsed toggle, no squad sheet)
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_SQUAD",
      payload: { squadId: null },
    });
  });
  await page.waitForTimeout(250);
  const dockToggle = page.locator('[data-testid="squad-dock"] .rf-map__legend-toggle');
  if (await dockToggle.count()) {
    await dockToggle.click({ force: true });
    await page.waitForTimeout(200);
  }
  await shot(page, `${tag}-squad-dock.png`);

  // 7) Capture sheet — toast must not peek behind modal
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
            // Leave a message to prove toasts stay hidden under capture.
            message: "Captured — choose occupation strength.",
            selectedSquadId: null,
            selectedTerritoryId: null,
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
