/**
 * Capture doctrine / strikes / recon / movement / events / templates / handoff.
 * Mobile 844×390 + desktop.
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const OUT = "/opt/cursor/artifacts";
const ROOT = join(import.meta.dirname, "..", "dist");
const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("saved", name);
}

async function dismissToast(page) {
  await page.evaluate(() => {
    try {
      window.__RF__?.dispatch?.({ type: "DISMISS_MESSAGE" });
      window.__RF__?.dispatch?.({ type: "DISMISS_ECONOMY_SUMMARY" });
      window.__RF__?.dispatch?.({ type: "DISMISS_NEWS_DIGEST" });
    } catch {
      /* */
    }
  });
}

function startStatic() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = req.url?.split("?")[0] || "/";
      if (p === "/") p = "/index.html";
      const file = join(ROOT, p.replace(/^\//, ""));
      if (!existsSync(file)) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "text/plain" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function bootGame(page) {
  await page.waitForFunction(() => window.__RF__?.dispatch, null, {
    timeout: 15000,
  });
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

async function capture(page, tag) {
  // Lobby doctrine pick
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: { ...window.__RF__.getState(), screen: "lobby", phase: "play" },
      },
    });
  });
  // Lobby is React-routed via App state — force via menu path
  await page.goto(page.url());
  await page.waitForTimeout(500);
  // Click Solo if on menu
  const solo = page.getByRole("button", { name: /Solo/i });
  if (await solo.first().isVisible().catch(() => false)) {
    await solo.first().click();
    await page.waitForTimeout(400);
  }
  // Select Ironclad doctrine card if present
  const iron = page.getByRole("button", { name: /Ironclad/i });
  if (await iron.first().isVisible().catch(() => false)) {
    await iron.first().click();
    await page.waitForTimeout(200);
  }
  await shot(page, `${tag}-lobby-doctrine`);

  await bootGame(page);

  // Enrich state for feature shots
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
            ...(s.newsFeed ?? []),
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
              researched: [
                ...new Set([
                  ...(player.researched ?? []),
                  "officer_corps",
                  "cruise_networks",
                  "orbital_uplink",
                  "stealth_recon",
                ]),
              ],
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

  // Fresh HUD with doctrine
  await shot(page, `${tag}-hud-doctrine`);

  // Strike FX on map + enemy selected
  await shot(page, `${tag}-strike-fx`);

  // Open news for event headline
  const newsBtn = page.getByRole("button", { name: /News/i });
  if (await newsBtn.first().isVisible().catch(() => false)) {
    await newsBtn.first().click();
    await page.waitForTimeout(300);
    await shot(page, `${tag}-event-news`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() =>
      window.__RF__.dispatch({ type: "MARK_NEWS_READ" }),
    );
  }

  // Recon exact vs pick another unrevealed enemy for approx — show sheet
  await page.waitForTimeout(200);
  await shot(page, `${tag}-recon-reveal`);

  // Labels + chips: zoom mid
  await page.evaluate(() => {
    const api = window.__RF__;
    // nudge camera if exposed; otherwise just screenshot map
    void api;
  });
  await shot(page, `${tag}-labels-chips`);

  // Army / invade with template + commander
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
        },
      },
    });
  });
  await page.waitForTimeout(400);
  const tpl = page.getByRole("button", { name: /Vanguard push/i });
  if (await tpl.first().isVisible().catch(() => false)) {
    await tpl.first().click();
    await page.waitForTimeout(200);
  }
  await shot(page, `${tag}-template-commander`);

  // Naval / air route hint — stay on invade with layer text
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
  await page.waitForTimeout(300);
  await shot(page, `${tag}-hotseat-handoff`);
}

async function main() {
  const { server, url } = await startStatic();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [tag, size] of [
      ["desktop", { width: 1400, height: 900 }],
      ["mobile", { width: 844, height: 390 }],
    ]) {
      const page = await browser.newPage({
        viewport: size,
        deviceScaleFactor: 1,
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      // Expose RF
      await page.waitForFunction(() => window.__RF__?.dispatch, null, {
        timeout: 20000,
      });
      await capture(page, tag);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
