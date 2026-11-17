#!/usr/bin/env node
/** Final PR #18 shots: right-dock panels + visible map minis. */
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
          newsDigest: null,
          screen: "map",
          phase: "play",
          pendingCapture: null,
        },
      },
    });
    return { home, enemy, friend };
  });
}

async function dismissOverlays(page) {
  const news = page.locator(".rf-news__backdrop");
  if ((await news.count()) > 0) {
    await news.first().click({ force: true }).catch(() => {});
  }
  const drawer = page.locator(".rf-drawer__backdrop");
  if ((await drawer.count()) > 0) {
    await drawer.first().click({ force: true }).catch(() => {});
  }
  await page.evaluate(() => {
    window.__RF__?.dispatch?.({ type: "DISMISS_MESSAGE" });
    const st = window.__RF__?.getState?.();
    if (st?.newsDigest) {
      window.__RF__.dispatch({
        type: "LOAD_STATE",
        payload: { state: { ...st, newsDigest: null } },
      });
    }
  });
  await page.waitForTimeout(60);
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

  // Default-zoom map with buildings + a squad visible (no panel covering map)
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
    // Frame home, then clear selection so panels hide but camera stays
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
  }, ids.home);
  await page.waitForTimeout(400);
  await dismissOverlays(page);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: null } });
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await page.waitForTimeout(200);
  await dismissOverlays(page);
  const miniInfo = await page.evaluate(() => ({
    images: document.querySelectorAll(".rf-map__svg image").length,
    bldgHits: document.querySelectorAll(".rf-map__bldg-hit").length,
    drawer: !!document.querySelector(".rf-map__territory-drawer"),
    squadSheet: !!document.querySelector(".rf-map__squad-sheet"),
  }));
  console.log(tag, "default-zoom minis", miniInfo);
  await shot(page, `${tag}-default-zoom-minis.png`);

  // Building menu in right panel (map still visible left)
  await dismissOverlays(page);
  await page.evaluate((home) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: home },
    });
  }, ids.home);
  await page.waitForTimeout(300);
  await dismissOverlays(page);
  const tap = await page.evaluate(() => {
    const dock = document.querySelector(".rf-map__territory-drawer");
    const dockLeft = dock?.getBoundingClientRect().left ?? Infinity;
    for (const el of document.querySelectorAll(
      ".rf-map__bldg-hit[data-instance-id]",
    )) {
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx >= dockLeft - 4) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top === el || top?.closest?.(".rf-map__bldg-hit") === el) {
        return { cx, cy };
      }
    }
    return null;
  });
  if (!tap) throw new Error("no clear building hit box");
  await page.mouse.click(tap.cx, tap.cy);
  await page.waitForTimeout(400);
  await page.waitForSelector(
    ".rf-map__territory-drawer [data-testid='building-popover']",
    { timeout: 8000 },
  );
  const dockW = await page.evaluate(() => {
    const el = document.querySelector(".rf-map__territory-drawer");
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  });
  console.log(tag, "right-dock width", dockW);
  await shot(page, `${tag}-building-menu-right.png`);

  // Barracks train scrolled
  const barracks = page.getByTestId("build-row-barracks");
  if (await barracks.count()) {
    await page
      .locator(".rf-bldg-pop__close")
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(150);
    await barracks.click({ force: true });
  } else {
    // Already on a building; try Train from current menu or open barracks via list
    await page
      .locator(".rf-bldg-pop__close")
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(150);
    await page.getByTestId("sheet-buildings-btn").click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
    await page.getByTestId("build-row-barracks").click({ force: true });
  }
  await page.waitForTimeout(250);
  await page.getByRole("menuitem", { name: /Train unit/i }).click({ force: true });
  await page.waitForTimeout(200);
  await page.getByTestId("train-trooper").click({ force: true }).catch(() => {});
  await page.waitForTimeout(200);
  await page.getByTestId("train-queue").scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${tag}-barracks-train.png`);

  // Pending join — right squad panel only
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
  const pendingInfo = await page.evaluate(() => ({
    dock: !!document.querySelector('[data-testid="squad-dock"]'),
    sheet: !!document.querySelector(".rf-map__squad-sheet"),
    joining: /joining/i.test(
      document.querySelector(".rf-map__squad-sheet")?.textContent ?? "",
    ),
  }));
  console.log(tag, "pending panel", pendingInfo);
  await shot(page, `${tag}-pending-join.png`);

  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await captureViewport(browser, "mobile", { width: 844, height: 390 });
  await captureViewport(browser, "desktop", { width: 1440, height: 900 });
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
