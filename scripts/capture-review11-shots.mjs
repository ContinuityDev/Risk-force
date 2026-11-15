#!/usr/bin/env node
/**
 * Review #11 Playwright proof shots (real in-game UI).
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
await page.waitForTimeout(300);
const newBtn = page.getByRole("button", { name: /New Campaign/i });
if (await newBtn.count()) await newBtn.click();
await page.waitForTimeout(250);
for (let i = 0; i < 12; i++) {
  if ((await page.locator(".rf-map").count()) > 0) break;
  const primary = page.locator("button.primary");
  if (await primary.count()) await primary.first().click();
  await page.waitForTimeout(300);
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
await page.waitForTimeout(600);

// 1) Energy tooltip at turn 1
await page.locator(".rf-resource--energy").hover();
await page.waitForTimeout(250);
await shot("risk-force-energy-ledger-turn1");

// 2) Deep zoom Italy / Balkans — thin borders, no Kosovo hole
const svgBox = await page.locator(".rf-map__svg").boundingBox();
if (!svgBox) throw new Error("no map svg");
await wheelAt(
  ".rf-map__svg",
  svgBox.x + svgBox.width * 0.53,
  svgBox.y + svgBox.height * 0.24,
  -120,
  16,
);
await page.waitForTimeout(400);
await shot("risk-force-map-deep-italy-balkans");

// Reset zoom
await wheelAt(
  ".rf-map__svg",
  svgBox.x + svgBox.width * 0.5,
  svgBox.y + svgBox.height * 0.5,
  200,
  40,
);
await page.waitForTimeout(200);

// 3) Base with selected building staffing panel
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
await page.waitForTimeout(700);
// Click a building pad to select it for staffing panel
const structure = page.locator(".rf-base__pad.is-filled").first();
if (await structure.count()) await structure.click();
await page.waitForTimeout(300);
await shot("risk-force-base-staffing-panel");

// 4) Advance to turn 10 for energy ledger
await page.evaluate(() => {
  window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "map" } });
});
await page.waitForTimeout(300);

for (let t = 0; t < 9; t++) {
  await page.getByRole("button", { name: /^End Turn$/i }).click();
  // Wait until human turn again
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(200);
    const ready = await page.evaluate(() => {
      const s = window.__RF__.getState();
      const pid = s.playerOrder[s.activePlayerIndex];
      return (
        s.players[pid]?.kind === "human" &&
        s.phase === "play" &&
        s.screen !== "battle"
      );
    });
    if (ready) break;
    // Skip battles if AI opened one
    const inBattle = await page.evaluate(
      () => window.__RF__.getState().phase === "battle",
    );
    if (inBattle) {
      await page.evaluate(() => {
        const s = window.__RF__.getState();
        window.__RF__.dispatch({
          type: "LOAD_STATE",
          payload: {
            state: {
              ...s,
              battle: null,
              phase: "play",
              screen: "map",
              pendingCapture: null,
            },
          },
        });
        window.__RF__.dispatch({ type: "END_TURN" });
      });
    }
  }
}
await page.locator(".rf-resource--energy").hover();
await page.waitForTimeout(250);
await shot("risk-force-energy-ledger-turn10");

// 5) AI turn log after a few turns — end turn once more and capture mid-AI
await page.getByRole("button", { name: /^End Turn$/i }).click();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(250);
  const info = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return {
      log: s.turnLog.length,
      descriptive: s.turnLog.some(
        (l) =>
          /builds .+ in |opens \d+ front|invades .+ from |reinforces /.test(l),
      ),
    };
  });
  if (info.descriptive) break;
}
await page.waitForTimeout(400);
await shot("risk-force-ai-turn-log-detail");

// 6) Battle start + mid
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
        if ((ets.buildings?.length ?? 0) >= 2) break;
      }
    }
    if (fromId) break;
  }
  if (!fromId || !toId) throw new Error("no invasion pair");
  const donor = Object.values(s.territories).find(
    (t) => t.buildings.length >= 4,
  );
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
    garrison: { trooper: 6, assault_mech: 2 },
  };
  territories[fromId] = {
    ...territories[fromId],
    owner: "player",
    garrison: {
      trooper: 10,
      assault_mech: 3,
      hover_tank: 2,
      siege_cannon: 2,
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
            resources: {
              ...s.players.player.resources,
              supply: 80,
              energy: Math.max(s.players.player.resources.energy, 400),
            },
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
        { unitId: "trooper", count: 8 },
        { unitId: "assault_mech", count: 2 },
        { unitId: "hover_tank", count: 2 },
        { unitId: "siege_cannon", count: 1 },
      ],
    },
  });
});

await page.waitForSelector(".rf-battle__arena", { timeout: 10000 });
await page.waitForTimeout(500);
await shot("risk-force-battle-deploy-start");

for (let i = 0; i < 40; i++) {
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.25 } });
  });
}
await page.waitForTimeout(300);
await shot("risk-force-battle-mid-exposure");

await browser.close();
console.log("Done.");
