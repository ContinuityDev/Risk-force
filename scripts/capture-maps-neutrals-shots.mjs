#!/usr/bin/env node
/**
 * Screenshots: lobby map picker, World War turn-1 neutrals,
 * neutral invade/capture, Civil War one-start.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-maps";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const hashes = new Map();

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  const buf = readFileSync(path);
  const hash = createHash("sha256").update(buf).digest("hex");
  if ([...hashes.entries()].some(([n, h]) => h === hash && n !== name)) {
    const dup = [...hashes.entries()].find(([, h]) => h === hash)?.[0];
    throw new Error(`Duplicate screenshot: ${name} === ${dup}`);
  }
  hashes.set(name, hash);
  console.log("saved", name, `(${buf.length}b)`);
}

async function waitRF(page) {
  await page.waitForFunction(
    () => window.__RF__ && typeof window.__RF__.dispatch === "function",
    null,
    { timeout: 30000 },
  );
}

async function dismissToast(page) {
  await page.evaluate(() => {
    window.__RF__?.dispatch?.({ type: "DISMISS_MESSAGE" });
    window.__RF__?.dispatch?.({ type: "DISMISS_ECONOMY_SUMMARY" });
    window.__RF__?.dispatch?.({ type: "DISMISS_NEWS_DIGEST" });
  });
  await page.waitForTimeout(100);
}

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
  await page.waitForTimeout(350);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(400);
}

async function newGame(page, mapId, seed = 42) {
  await page.evaluate(
    ({ mapId, seed }) => {
      window.__RF__.dispatch({
        type: "NEW_GAME",
        payload: {
          humanCount: 1,
          aiCount: 2,
          multiplayerMode: "solo",
          seed,
          difficulty: "normal",
          doctrineId: "vanguard",
          mapId,
        },
      });
    },
    { mapId, seed },
  );
  await page.waitForTimeout(400);
  await dismissToast(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  await boot(page);
  await page.waitForSelector('[data-testid="map-picker"]', { timeout: 15000 });
  await shot(page, "desktop-lobby-map-picker");

  // Start via UI so lobby→map transition is real, then reseed for determinism
  await page.getByTestId("map-world_war").click();
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(700);
  await waitRF(page);
  await newGame(page, "world_war", 42);

  const home = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0];
  });
  await page.evaluate((hid) => {
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: hid } });
  }, home);
  await page.waitForTimeout(250);
  await dismissToast(page);
  await shot(page, "desktop-turn1-world-war-neutrals");

  // Neutral invade + capture setup
  const target = await page.evaluate((hid) => {
    const s = window.__RF__.getState();
    const n = window.__RF__.neighbors[hid] ?? [];
    return n.find((id) => s.territories[id]?.owner === "neutral") ?? null;
  }, home);
  if (!target) throw new Error("No neutral neighbor for invade shot");

  await page.evaluate(
    ({ home, target }) => {
      const s = window.__RF__.getState();
      window.__RF__.dispatch({
        type: "LOAD_STATE",
        payload: {
          state: {
            ...s,
            phase: "capture",
            screen: "capture",
            selectedTerritoryId: target,
            message: null,
            pendingCapture: {
              territoryId: target,
              fromId: home,
              attacker: "player",
              survivors: [
                { unitId: "trooper", count: 6 },
                { unitId: "assault_mech", count: 1 },
              ],
              buildings: s.territories[target].buildings,
              population: s.territories[target].population,
              workers: 0,
              supplyStock: s.territories[target].supplyStock ?? 4,
            },
            territories: {
              ...s.territories,
              [home]: {
                ...s.territories[home],
                garrison: { trooper: 4 },
                supplyStock: 40,
              },
              [target]: {
                ...s.territories[target],
                owner: "player",
                control: "occupied",
                garrison: {},
              },
            },
            players: {
              ...s.players,
              player: {
                ...s.players.player,
                resources: {
                  ...s.players.player.resources,
                  supply: 80,
                },
              },
            },
            newsFeed: [
              ...(s.newsFeed ?? []),
              {
                id: "n-neutral",
                turn: s.turn,
                category: "territory",
                headline: "Commander claims neutral land",
                body: "Neutral garrison collapsed. Occupation begins.",
                factionId: "player",
                timestamp: Date.now(),
              },
            ],
            newsUnread: 1,
          },
        },
      });
    },
    { home, target },
  );
  await page.waitForTimeout(350);
  await shot(page, "desktop-neutral-invade-capture");

  // Civil War one-start
  await newGame(page, "civil_war", 99);
  const cwHome = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0];
  });
  await page.evaluate((hid) => {
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: hid } });
  }, cwHome);
  await page.waitForTimeout(300);
  await dismissToast(page);
  await shot(page, "desktop-turn1-civil-war-neutrals");

  // Mid-zoom Civil War region view
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const home =
      Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0];
    const t = Object.keys(s.territories).includes(home) ? home : "texas";
    window.__RF__.dispatch({ type: "SELECT_TERRITORY", payload: { territoryId: t } });
  });
  await page.waitForTimeout(200);
  // Zoom via wheel on map if possible
  const svg = page.locator('[data-tutorial="map-svg"]');
  if (await svg.count()) {
    const box = await svg.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
      await page.mouse.wheel(0, -900);
      await page.waitForTimeout(250);
    }
  }
  await shot(page, "desktop-civil-war-midzoom");

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
