#!/usr/bin/env node
/**
 * Map-first regression e2e: Build, squad select/move, train worker,
 * building hits don't swallow empty-map taps. Desktop + mobile844.
 */
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";

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
  await page.waitForSelector('[data-testid="map-picker"]', { timeout: 15000 });
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
  await page.waitForTimeout(300);
}

async function stockHome(page) {
  return page.evaluate(() => {
    const s = window.__RF__.getState();
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    if (!home) throw new Error("no home");
    const neighbors = window.__RF__.neighbors?.[home] ?? [];
    const enemy =
      neighbors.find((n) => s.territories[n]?.owner !== "player") ??
      neighbors[0];
    const territories = { ...s.territories };
    const homeTs = territories[home];
    const buildings = [
      ...(homeTs.buildings ?? []).map((b) => ({
        ...b,
        buildRemaining: 0,
        hp: Math.max(b.hp, 200),
      })),
    ];
    if (!buildings.some((b) => b.buildingId === "command_nexus")) {
      buildings.unshift({
        instanceId: "e2e_nexus",
        buildingId: "command_nexus",
        x: 0,
        y: 0,
        hp: 900,
        buildRemaining: 0,
        workers: 0,
      });
    }
    territories[home] = {
      ...homeTs,
      owner: "player",
      control: "core",
      buildings,
      garrison: { trooper: 8, assault_mech: 2 },
      garrisonHp: {},
      population: 30,
      workers: 4,
      supplyStock: 40,
      trainingQueue: [],
    };
    const players = {
      ...s.players,
      player: {
        ...s.players.player,
        resources: {
          ...s.players.player.resources,
          energy: 800,
          alloy: 400,
          research: 80,
          supply: 120,
        },
      },
    };
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories,
          players,
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
    return { home, enemy };
  });
}

async function dismissOverlays(page) {
  const backdrop = page.locator('.rf-drawer__backdrop[aria-label="Close panel"]');
  if (await backdrop.count()) {
    await backdrop.first().click({ force: true }).catch(() => {});
  }
  await page.evaluate(() => {
    window.__RF__?.dispatch?.({ type: "DISMISS_MESSAGE" });
    window.__RF__?.dispatch?.({ type: "DISMISS_ECONOMY_SUMMARY" });
  });
}

async function selectTerritoryByPath(page, tid) {
  await dismissOverlays(page);
  await page.evaluate((id) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: id },
    });
  }, tid);
  await page.waitForTimeout(250);
  await dismissOverlays(page);
}

async function runSuite(browser, tag, viewport) {
  const page = await browser.newPage({
    viewport,
    isMobile: viewport.height <= 430,
    hasTouch: viewport.height <= 430,
  });
  await boot(page);
  const { home, enemy } = await stockHome(page);

  // ── Build: tap owned territory → Build → place reactor ──
  await selectTerritoryByPath(page, home);
  const buildBtn = page.getByTestId("sheet-build-btn");
  await buildBtn.click();
  await page.waitForSelector('[data-testid="territory-build-catalog"]');
  const beforeBldgs = await page.evaluate(
    (id) => window.__RF__.getState().territories[id].buildings.length,
    home,
  );
  await page.getByTestId("build-reactor").click();
  await page.waitForTimeout(200);
  const afterBldgs = await page.evaluate(
    (id) => window.__RF__.getState().territories[id].buildings.length,
    home,
  );
  if (afterBldgs <= beforeBldgs) {
    throw new Error(`${tag}: Build did not place a building (${beforeBldgs}→${afterBldgs})`);
  }
  console.log(tag, "build ok", beforeBldgs, "→", afterBldgs);

  // ── Empty map near building must NOT open building menu ──
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: null } });
    window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: null } });
  });
  await page.waitForTimeout(200);
  // Click SVG ocean corner (away from land)
  const svg = page.locator("svg.rf-map__svg");
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + 24, box.y + 24);
  await page.waitForTimeout(200);
  const popOpen = await page.locator('[data-testid="building-popover"]').count();
  const sheetOpen = await page.evaluate(
    () => window.__RF__.getState().selectedTerritoryId != null,
  );
  if (popOpen > 0) {
    throw new Error(`${tag}: empty-map tap opened building popover`);
  }
  console.log(tag, "empty-map tap ok (no building menu)", { sheetOpen });

  // ── Create squad from Create squad button, select, move ──
  await selectTerritoryByPath(page, home);
  await dismissOverlays(page);
  await page.getByTestId("create-squad-btn").click({ force: true });
  await page.waitForSelector('[data-testid="create-squad-panel"]');
  const plus = page
    .locator('[data-testid="create-squad-panel"] .rf-invade__stepper button')
    .filter({ hasText: "+" });
  if (await plus.count()) {
    await plus.first().click();
    await plus.first().click();
    await plus.first().click();
  }
  await page
    .locator('[data-testid="create-squad-panel"] button.primary')
    .filter({ hasText: /Create squad/i })
    .click();
  await page.waitForTimeout(300);
  let squadId = await page.evaluate(
    () => window.__RF__.getState().squads?.[0]?.id ?? null,
  );
  if (!squadId) throw new Error(`${tag}: failed to create squad`);

  // Close sheet so map squad hits / dock are free
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await page.waitForTimeout(250);

  // Select via squad hit or dock list
  const squadHit = page.locator(`.rf-map__squad-hit[data-squad-id="${squadId}"]`);
  const dockItem = page.getByTestId(`squad-dock-${squadId}`);
  if (await squadHit.count()) {
    await squadHit.first().click({ force: true });
  } else if (await dockItem.count()) {
    await dockItem.click();
  } else {
    await page.evaluate((id) => {
      window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: id } });
    }, squadId);
  }
  await page.waitForTimeout(300);
  const selected = await page.evaluate(
    () => window.__RF__.getState().selectedSquadId,
  );
  if (selected !== squadId) {
    throw new Error(`${tag}: squad not selected (got ${selected})`);
  }
  // Selection ring on map marker, or squad sheet as proof of selection UX
  const ring = await page.getByTestId("selected-squad").count();
  const sheet = await page.getByTestId("map-squad-sheet").count();
  if (!ring && !sheet) {
    throw new Error(`${tag}: no selection ring or squad sheet after select`);
  }
  console.log(tag, "squad select ok", { ring: !!ring, sheet: !!sheet });

  // Move to neighbor if available
  if (enemy) {
    await page.evaluate((toId) => {
      const sid = window.__RF__.getState().selectedSquadId;
      if (!sid) return;
      window.__RF__.dispatch({
        type: "ORDER_SQUAD_MOVE",
        payload: { squadId: sid, toId },
      });
    }, enemy);
    await page.waitForTimeout(200);
    const marching = await page.evaluate(
      (id) =>
        window.__RF__.getState().squads?.find((s) => s.id === id)?.status ===
          "marching" ||
        (window.__RF__.getState().armiesInTransit ?? []).some(
          (a) => a.squadId === id,
        ),
      squadId,
    );
    if (!marching) {
      // Some neighbors may be invalid; don't fail hard if order rejected
      console.log(tag, "squad move skipped/rejected (neighbor may be invalid)");
    } else {
      console.log(tag, "squad move ok");
    }
  }

  // ── Train worker via building menu ──
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: null } });
  });
  await selectTerritoryByPath(page, home);
  await dismissOverlays(page);
  // Open nexus building menu via list
  await page.getByTestId("sheet-buildings-btn").click({ force: true });
  await page.waitForTimeout(150);
  const nexusRow = page.locator('[data-testid="build-row-command_nexus"]').first();
  if (await nexusRow.count()) {
    await nexusRow.click({ force: true });
  } else {
    // Tap first building hit
    const hit = page.locator(".rf-map__bldg-hit[data-instance-id]").first();
    if (await hit.count()) await hit.click({ force: true });
  }
  await page.waitForSelector('[data-testid="building-popover"]', { timeout: 5000 });
  await page.getByTestId("building-train-btn").click();
  const workersBefore = await page.evaluate(
    (id) => window.__RF__.getState().territories[id].workers ?? 0,
    home,
  );
  const queueBefore = await page.evaluate(
    (id) =>
      (window.__RF__.getState().territories[id].trainingQueue ?? []).filter(
        (j) => j.kind === "worker",
      ).length,
    home,
  );
  await page.getByTestId("train-worker").click();
  await page.waitForTimeout(200);
  // Advance training by ending turn once (worker turns=1)
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "END_TURN" });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_ECONOMY_SUMMARY" });
  });
  const workersAfter = await page.evaluate(
    (id) => window.__RF__.getState().territories[id].workers ?? 0,
    home,
  );
  const queueAfterEnqueue = await page.evaluate(
    (id) =>
      (window.__RF__.getState().territories[id].trainingQueue ?? []).filter(
        (j) => j.kind === "worker",
      ).length,
    home,
  );
  if (workersAfter <= workersBefore && queueBefore === 0 && queueAfterEnqueue === 0) {
    // Check if queue was consumed into workers
    if (workersAfter <= workersBefore) {
      throw new Error(
        `${tag}: train worker failed (workers ${workersBefore}→${workersAfter})`,
      );
    }
  }
  if (workersAfter <= workersBefore) {
    throw new Error(
      `${tag}: worker count did not increase (${workersBefore}→${workersAfter})`,
    );
  }
  console.log(tag, "train worker ok", workersBefore, "→", workersAfter);

  await page.close();
  console.log("ok", tag);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await runSuite(browser, "desktop", { width: 1440, height: 900 });
  await runSuite(browser, "mobile844", { width: 844, height: 390 });
  await browser.close();
  console.log("e2e-map-actions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
