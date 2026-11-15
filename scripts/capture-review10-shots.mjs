#!/usr/bin/env node
/**
 * Real in-game Playwright screenshots (Hayden review #10).
 * Uses window.__RF__ — no ellipse mock diagrams.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
});

async function shot(name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name);
}

async function waitRF() {
  await page.waitForFunction(
    () => window.__RF__ && window.__RF__.neighbors,
    null,
    { timeout: 20000 },
  );
}

function wheelAt(svgSel, clientX, clientY, deltaY, times) {
  return page.evaluate(
    ({ svgSel, clientX, clientY, deltaY, times }) => {
      const svg = document.querySelector(svgSel);
      if (!svg) return;
      for (let i = 0; i < times; i++) {
        svg.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY,
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { svgSel, clientX, clientY, deltaY, times },
  );
}

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const newBtn = page.getByRole("button", { name: /New Campaign/i });
if (await newBtn.count()) await newBtn.click();
await page.waitForTimeout(300);

for (let i = 0; i < 12; i++) {
  if ((await page.locator(".rf-map").count()) > 0) break;
  const primary = page.locator("button.primary");
  if (await primary.count()) await primary.first().click();
  await page.waitForTimeout(350);
}
await waitRF();

await page.evaluate(() => {
  window.__RF__.dispatch({
    type: "NEW_GAME",
    payload: {
      humanCount: 1,
      aiCount: 2,
      multiplayerMode: "solo",
      seed: 4242,
    },
  });
});
await page.waitForTimeout(700);

// 1) World zoom — no labels
await shot("risk-force-map-world-no-labels");

// 2) Mid zoom Europe
const svgBox = await page.locator(".rf-map__svg").boundingBox();
if (!svgBox) throw new Error("no map svg");
const euroX = svgBox.x + svgBox.width * 0.55;
const euroY = svgBox.y + svgBox.height * 0.24;
await wheelAt(".rf-map__svg", euroX, euroY, -120, 9);
await page.waitForTimeout(450);
await shot("risk-force-map-europe-mid-labels");

// 3) Deep zoom — Alps / Benelux so small-country labels unlock
await wheelAt(
  ".rf-map__svg",
  svgBox.x + svgBox.width * 0.52,
  svgBox.y + svgBox.height * 0.22,
  -120,
  18,
);
await page.waitForTimeout(450);
await shot("risk-force-map-deep-labels");

// Reset zoom
await wheelAt(
  ".rf-map__svg",
  svgBox.x + svgBox.width * 0.5,
  svgBox.y + svgBox.height * 0.5,
  200,
  40,
);
await page.waitForTimeout(300);

// 4) Player-owned base training panel
const ownedCore = await page.evaluate(() => {
  const s = window.__RF__.getState();
  const hit = Object.entries(s.territories).find(
    ([, t]) => t.owner === "player" && t.buildings.length > 2,
  );
  return hit?.[0] ?? null;
});
if (!ownedCore) throw new Error("no player core");
await page.evaluate((tid) => {
  window.__RF__.dispatch({
    type: "SELECT_TERRITORY",
    payload: { territoryId: tid },
  });
  window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "base" } });
}, ownedCore);
await page.waitForTimeout(900);
await shot("risk-force-base-pop-train");

// 5) Army transit on real map
await page.evaluate(() => {
  window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
});
await page.waitForTimeout(400);

const marchPair = await page.evaluate(() => {
  const s = window.__RF__.getState();
  const neigh = window.__RF__.neighbors;
  for (const [fromId, ns] of Object.entries(neigh)) {
    if (s.territories[fromId]?.owner !== "player") continue;
    for (const toId of ns) {
      if (s.territories[toId]?.owner === "player") {
        return { fromId, toId, forceOwner: false };
      }
    }
  }
  for (const [fromId, ns] of Object.entries(neigh)) {
    if (s.territories[fromId]?.owner !== "player") continue;
    if (ns[0]) return { fromId, toId: ns[0], forceOwner: true };
  }
  return null;
});
if (!marchPair) throw new Error("no march pair");

await page.evaluate((pair) => {
  const s = window.__RF__.getState();
  const territories = { ...s.territories };
  if (pair.forceOwner) {
    territories[pair.toId] = {
      ...territories[pair.toId],
      owner: "player",
    };
  }
  territories[pair.fromId] = {
    ...territories[pair.fromId],
    garrison: { trooper: 10, hover_tank: 2, assault_mech: 2 },
  };
  window.__RF__.dispatch({
    type: "LOAD_STATE",
    payload: { state: { ...s, territories, screen: "map", phase: "play" } },
  });
  window.__RF__.dispatch({
    type: "ORDER_MOVE",
    payload: {
      fromId: pair.fromId,
      toId: pair.toId,
      force: [
        { unitId: "trooper", count: 5 },
        { unitId: "hover_tank", count: 1 },
      ],
    },
  });
}, marchPair);
await page.waitForTimeout(500);
await wheelAt(
  ".rf-map__svg",
  svgBox.x + svgBox.width * 0.45,
  svgBox.y + svgBox.height * 0.4,
  -120,
  6,
);
await page.waitForTimeout(400);
await shot("risk-force-armies-transit");

// 6) AI multi-front + turn log
await wheelAt(
  ".rf-map__svg",
  svgBox.x + svgBox.width * 0.5,
  svgBox.y + svgBox.height * 0.5,
  160,
  10,
);

await page.evaluate(() => {
  const s = window.__RF__.getState();
  const territories = { ...s.territories };
  const players = { ...s.players };
  for (const [id, ts] of Object.entries(territories)) {
    if (ts.owner === "player") continue;
    // Moderate garrisons so AI can afford multi-front without insolvency
    territories[id] = {
      ...ts,
      garrison: {
        trooper: 8,
        assault_mech: 2,
        hover_tank: 2,
      },
    };
  }
  for (const [pid, p] of Object.entries(players)) {
    if (pid === "player") continue;
    players[pid] = {
      ...p,
      resources: {
        ...p.resources,
        energy: Math.max(p.resources.energy, 8000),
        alloy: Math.max(p.resources.alloy, 400),
        supply: Math.max(p.resources.supply, 60),
      },
    };
  }
  window.__RF__.dispatch({
    type: "LOAD_STATE",
    payload: {
      state: {
        ...s,
        territories,
        players,
        screen: "map",
        phase: "play",
        turnLog: [],
        aiAttackPlans: [],
        battle: null,
        activePlayerIndex: 0,
      },
    },
  });
});

await page.getByRole("button", { name: /^End Turn$/i }).click();
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(350);
  const info = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return {
      plans: s.aiAttackPlans.length,
      log: s.turnLog.length,
      battle: s.phase === "battle",
    };
  });
  if (info.plans > 0 || info.battle) break;
}
await page.waitForTimeout(500);
// Stay on map for arrows (exit battle view if invasion already started)
await page.evaluate(() => {
  const s = window.__RF__.getState();
  if (s.screen === "battle" || s.phase === "battle") {
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          battle: null,
          phase: "play",
          screen: "map",
        },
      },
    });
  }
});
await page.waitForTimeout(300);
await shot("risk-force-ai-turn-log");

// Zoom onto the live AI front (Cambodia → Thailand) for arrow visibility
const focus = await page.evaluate(() => {
  const plans = window.__RF__.getState().aiAttackPlans;
  const id = plans[0]?.toId || plans[0]?.fromId || "thailand";
  const path = document.querySelector(`[data-territory-id="${id}"]`);
  if (!path) return null;
  const r = path.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const aiBox = await page.locator(".rf-map__svg").boundingBox();
if (aiBox) {
  // Reset toward world, then zoom into the front
  await wheelAt(
    ".rf-map__svg",
    aiBox.x + aiBox.width / 2,
    aiBox.y + aiBox.height / 2,
    200,
    25,
  );
  await page.waitForTimeout(200);
  const cx = focus?.x ?? aiBox.x + aiBox.width * 0.78;
  const cy = focus?.y ?? aiBox.y + aiBox.height * 0.48;
  await wheelAt(".rf-map__svg", cx, cy, -120, 10);
}
await page.waitForTimeout(450);
await shot("risk-force-ai-attack-plans");

// 7) Live battle with full base + large force
await page.evaluate(() => {
  const s = window.__RF__.getState();
  const neigh = window.__RF__.neighbors;
  let fromId = null;
  let toId = null;
  for (const [id, ts] of Object.entries(s.territories)) {
    if (ts.owner !== "player") continue;
    for (const n of neigh[id] || []) {
      const ets = s.territories[n];
      if (ets && ets.owner !== "player") {
        fromId = id;
        toId = n;
        if ((ets.buildings?.length ?? 0) >= 3) break;
      }
    }
    if (fromId) break;
  }
  if (!fromId || !toId) throw new Error("no invasion pair");

  const donor = Object.values(s.territories).find((t) => t.buildings.length >= 5);
  const territories = { ...s.territories };
  territories[toId] = {
    ...territories[toId],
    owner:
      territories[toId].owner === "player"
        ? "faction_a"
        : territories[toId].owner,
    buildings: (donor?.buildings ?? territories[toId].buildings).map(
      (b, i) => ({ ...b, instanceId: `def_b${i}`, buildRemaining: 0 }),
    ),
    garrison: { trooper: 8, assault_mech: 2, hover_tank: 2 },
  };
  territories[fromId] = {
    ...territories[fromId],
    owner: "player",
    garrison: {
      trooper: 14,
      assault_mech: 4,
      hover_tank: 3,
      siege_cannon: 2,
      drone: 3,
    },
  };

  window.__RF__.dispatch({
    type: "LOAD_STATE",
    payload: {
      state: {
        ...s,
        territories,
        battle: null,
        phase: "play",
        screen: "map",
        pendingCapture: null,
        activePlayerIndex: 0,
        players: {
          ...s.players,
          player: {
            ...s.players.player,
            resources: { ...s.players.player.resources, supply: 80 },
          },
        },
      },
    },
  });
  window.__RF__.dispatch({
    type: "START_INVASION",
    payload: {
      fromId,
      toId,
      force: [
        { unitId: "trooper", count: 10 },
        { unitId: "assault_mech", count: 3 },
        { unitId: "hover_tank", count: 3 },
        { unitId: "siege_cannon", count: 2 },
        { unitId: "drone", count: 2 },
      ],
    },
  });
});

await page.waitForSelector(".rf-battle__arena", { timeout: 10000 });
await page.waitForTimeout(500);
await shot("risk-force-battle-deploy-zones");

for (let i = 0; i < 45; i++) {
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.25 } });
  });
}
await page.waitForTimeout(350);
await shot("risk-force-battle-mid-ground");

await browser.close();
console.log("Done.");
