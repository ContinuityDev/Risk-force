#!/usr/bin/env node
/**
 * Screenshots for doctrines / strikes / recon / naval-air / events / templates / handoff.
 * Mobile 844×390 + desktop.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";
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
    window.__RF__?.dispatch?.({ type: "DISMISS_ECONOMY_SUMMARY" });
    window.__RF__?.dispatch?.({ type: "DISMISS_NEWS_DIGEST" });
  });
  await page.waitForTimeout(150);
}

async function openLobby(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(500);
}

async function startWithDoctrine(page) {
  await openLobby(page);
  const iron = page.getByRole("button", { name: /Ironclad/i });
  if (await iron.count()) await iron.first().click();
  await page.waitForTimeout(200);
  await shot(page, page.viewportSize().width < 1000 ? "mobile-lobby-doctrine" : "desktop-lobby-doctrine");
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
        difficulty: "normal",
        doctrineId: "vanguard",
      },
    });
  });
  await page.waitForTimeout(400);
  await dismissToast(page);
}

async function enrich(page) {
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    const enemy = Object.entries(s.territories).find(
      ([, t]) => t.owner !== "player",
    )?.[0];
    if (!home || !enemy) return;
    const ts = s.territories[home];
    const player = s.players.player;
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          message: null,
          screen: "map",
          phase: "play",
          selectedTerritoryId: enemy,
          handoff: null,
          strikeFx: [
            {
              id: "sfx-demo",
              kind: "orbital",
              territoryId: enemy,
              turn: s.turn,
              createdAt: Date.now(),
            },
          ],
          theaterEvents: [
            {
              id: "evt-demo",
              kind: "solar_flare",
              turn: s.turn,
              territoryId: enemy,
              headline: "Solar flare scrambles uplinks",
              body: "Geomagnetic storm — orbital assets offline.",
            },
          ],
          newsFeed: [
            {
              id: "n-evt",
              turn: s.turn,
              category: "event",
              headline: "Solar flare scrambles uplinks",
              body: "Geomagnetic storm over the theater.",
              timestamp: Date.now(),
            },
            {
              id: "n-strike",
              turn: s.turn,
              category: "strike",
              headline: "Orbital Strike hits target sector",
              body: "Structures damaged, shields offline.",
              factionId: "player",
              timestamp: Date.now(),
            },
          ],
          newsUnread: 2,
          players: {
            ...s.players,
            player: {
              ...player,
              doctrineId: "vanguard",
              commanders: [
                {
                  id: "cmd1",
                  role: "infantry",
                  name: "Col. Hale",
                  attachedTerritoryId: home,
                },
              ],
              armyTemplates: [
                {
                  id: "tpl1",
                  name: "Vanguard push",
                  composition: { trooper: 3, assault_mech: 1 },
                },
              ],
              recon: [
                {
                  targetTerritoryId: enemy,
                  targetFactionId: s.territories[enemy].owner,
                  untilTurn: s.turn + 3,
                  mode: "drone",
                },
              ],
              resources: {
                ...player.resources,
                energy: 800,
                alloy: 200,
                supply: 120,
              },
            },
          },
          territories: {
            ...s.territories,
            [home]: {
              ...ts,
              garrison: {
                ...ts.garrison,
                trooper: 6,
                assault_mech: 1,
                cruise_launcher: 1,
                stealth_recon_drone: 1,
                orbital_strike_uplink: 1,
                drone: 2,
                patrol_boat: 2,
              },
              buildings: [
                ...ts.buildings,
                {
                  instanceId: "b-wc",
                  buildingId: "war_college",
                  x: 1,
                  y: 3,
                  hp: 280,
                  buildRemaining: 0,
                  workers: 1,
                },
              ],
            },
          },
        },
      },
    });
  });
  await page.waitForTimeout(400);
  await dismissToast(page);
}

async function runViewport(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await startWithDoctrine(page);
  // startWithDoctrine already saved lobby for this viewport via width check — re-save with tag
  // (lobby already captured inside startWithDoctrine with mobile/desktop prefix)

  await enrich(page);
  await shot(page, `${tag}-hud-doctrine`);
  await shot(page, `${tag}-strike-fx`);
  await shot(page, `${tag}-recon-reveal`);
  await shot(page, `${tag}-labels-chips`);

  // News / event
  await page.evaluate(() => window.__RF__?.openNews?.());
  await page.waitForTimeout(350);
  await shot(page, `${tag}-event-news`);
  await page.evaluate(() => {
    window.__RF__?.closeNews?.();
    window.__RF__.dispatch({ type: "MARK_NEWS_READ" });
    window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
  });
  await page.waitForTimeout(200);

  // Invade templates + commander
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const home = Object.entries(s.territories).find(
      ([, t]) => t.owner === "player",
    )?.[0];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          selectedTerritoryId: home,
          screen: "invade",
          message: null,
          handoff: null,
          newsDigest: null,
        },
      },
    });
  });
  await page.waitForTimeout(500);
  const tpl = page.getByRole("button", { name: /Vanguard push/i });
  if (await tpl.count()) {
    await tpl.first().click({ force: true });
    await page.waitForTimeout(200);
  }
  await shot(page, `${tag}-template-commander`);
  await shot(page, `${tag}-naval-air-layer`);

  // Hot-seat handoff
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          multiplayerMode: "hotseat",
          screen: "map",
          handoff: {
            fromName: "Commander",
            toName: "Officer",
            toFactionId: "faction_a",
          },
        },
      },
    });
  });
  await page.waitForTimeout(350);
  await shot(page, `${tag}-hotseat-handoff`);

  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, { width: 1400, height: 900 }, "desktop");
    await runViewport(browser, { width: 844, height: 390 }, "mobile");
  } finally {
    await browser.close();
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
