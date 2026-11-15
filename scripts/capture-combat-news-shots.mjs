#!/usr/bin/env node
/**
 * Proof shots for combat FX, building blurbs, AI economy news, HUD badge.
 */
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force/";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-combat-news";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name, page.viewportSize());
}

async function waitRF(page) {
  await page.waitForFunction(
    () => window.__RF__ && window.__RF__.neighbors,
    null,
    { timeout: 25000 },
  );
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator(".rf-menu button.primary").click();
  await page.waitForSelector(".rf-lobby");
  await page.locator(".rf-lobby button.primary").click();
  await page.waitForSelector(".rf-map");
  await waitRF(page);
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
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({
      type: "DISMISS_NEWS_DIGEST",
    });
  });
}

async function forceBattle(page) {
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const neigh = window.__RF__.neighbors;
    let fromId = null;
    let toId = null;
    for (const [id, ts] of Object.entries(s.territories)) {
      if (ts.owner !== "player") continue;
      for (const n of neigh[id] || []) {
        if (s.territories[n] && s.territories[n].owner !== "player") {
          fromId = id;
          toId = n;
          break;
        }
      }
      if (fromId) break;
    }
    const donor = Object.values(s.territories).find(
      (t) => t.buildings.length >= 3,
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
      garrison: { trooper: 5, assault_mech: 2 },
    };
    territories[fromId] = {
      ...territories[fromId],
      owner: "player",
      garrison: {
        trooper: 10,
        assault_mech: 3,
        hover_tank: 2,
        siege_cannon: 1,
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
          message: null,
          newsDigest: null,
          activePlayerIndex: 0,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              resources: {
                ...s.players.player.resources,
                supply: 90,
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
          { unitId: "hover_tank", count: 1 },
        ],
      },
    });
  });
  await page.waitForSelector(".rf-battle__arena", { timeout: 12000 });
  await page.evaluate(() =>
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" }),
  );
}

async function suite(page, tag) {
  await boot(page);

  // HUD news icon (seed unread badge)
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          newsUnread: 3,
          newsFeed: [
            {
              id: "n1",
              turn: 1,
              category: "build",
              headline: "Faction A expands industry in Libya",
              body: "Construction begins on a Fusion Reactor.",
              factionId: "faction_a",
              timestamp: Date.now(),
            },
            {
              id: "n2",
              turn: 1,
              category: "research",
              headline: "Faction B opens research: grav armor",
              body: "Labs begin work on grav armor.",
              factionId: "faction_b",
              timestamp: Date.now(),
            },
            {
              id: "n3",
              turn: 1,
              category: "battle",
              headline: "Faction A seizes Morocco",
              body: "Taken from Commander. Garrison collapsed.",
              factionId: "faction_a",
              timestamp: Date.now(),
            },
          ],
        },
      },
    });
  });
  await page.waitForTimeout(200);
  await shot(page, `risk-force-news-hud-badge${tag}`);

  // Building description in base
  const owned = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return Object.entries(s.territories).find(
      ([, t]) => t.owner === "player" && t.buildings.length > 1,
    )?.[0];
  });
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
    window.__RF__.dispatch({ type: "SET_SCREEN", payload: { screen: "base" } });
  }, owned);
  await page.waitForTimeout(500);
  // Open catalog / select a buildable structure
  const toggle = page.locator(".rf-base__drawer-toggle");
  if (await toggle.count()) await toggle.click();
  await page.waitForTimeout(250);
  const reactorBtn = page.locator(".rf-base__catalog button", {
    hasText: "Fusion Reactor",
  });
  if (await reactorBtn.count()) {
    await reactorBtn.first().click();
  } else {
    // click first catalog structure button
    const any = page.locator(".rf-base__catalog li button").first();
    if (await any.count()) await any.click();
  }
  await page.waitForTimeout(300);
  await page.mouse.move(2, 2);
  await shot(page, `risk-force-building-description${tag}`);

  // Battle mid-fight + frame sequence — wait until tracers are in flight
  await forceBattle(page);
  await page.evaluate(async () => {
    let guard = 0;
    while (guard++ < 80) {
      window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.12 } });
      const b = window.__RF__.getState().battle;
      if (!b || b.status !== "running") break;
      if ((b.projectiles?.length ?? 0) >= 2) break;
      await new Promise((r) => setTimeout(r, 16));
    }
  });
  await page.waitForTimeout(120);
  await shot(page, `risk-force-battle-midfight${tag}`);

  // Frame sequence — capture while shots travel across the gap
  const frames = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() =>
      window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.1 } }),
    );
    await page.waitForTimeout(90);
    const fp = join(TMP, `battle-frame${tag}-${i}.png`);
    await page.screenshot({ path: fp });
    frames.push(fp);
  }
  // Copy first/mid/last as sequence proof
  copyFileSync(frames[0], join(OUT, `risk-force-battle-frame${tag}-0.png`));
  copyFileSync(frames[2], join(OUT, `risk-force-battle-frame${tag}-1.png`));
  copyFileSync(frames[5], join(OUT, `risk-force-battle-frame${tag}-2.png`));
  console.log("saved battle frames", tag || "844");

  // Resolve and return to map, then end turn for AI news
  await page.evaluate(() => {
    let s = window.__RF__.getState();
    let n = 0;
    while (s.battle?.status === "running" && n++ < 300) {
      window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.5 } });
      s = window.__RF__.getState();
    }
    if (s.battle) window.__RF__.dispatch({ type: "RESOLVE_BATTLE" });
    if (window.__RF__.getState().pendingCapture) {
      window.__RF__.dispatch({
        type: "CONFIRM_CAPTURE",
        payload: { occupyCount: 4 },
      });
    }
    window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
  });
  await page.waitForTimeout(300);

  // Ensure map + human turn, then end turn to trigger AI + digest
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    // Force human active play
    const idx = s.playerOrder.findIndex((id) => s.players[id]?.kind === "human");
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          phase: "play",
          screen: "map",
          battle: null,
          pendingCapture: null,
          activePlayerIndex: idx >= 0 ? idx : 0,
          newsDigest: null,
          message: null,
        },
      },
    });
  });
  await page.waitForTimeout(200);
  // Clear seeded badge news so the digest is AI-only and priority-sorted
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          newsFeed: [],
          newsUnread: 0,
          newsDigest: null,
        },
      },
    });
  });
  await page.evaluate(() => window.__RF__.dispatch({ type: "END_TURN" }));
  // Wait for digest
  await page.waitForSelector(".rf-news--digest", { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, `risk-force-news-report${tag}`);

  // AI economy evidence from news cards
  const economyLines = await page.evaluate(() => {
    const s = window.__RF__.getState();
    return (s.newsFeed || [])
      .filter(
        (n) =>
          n.category === "build" ||
          n.category === "economy" ||
          n.category === "research",
      )
      .map((n) => `${n.category}: ${n.headline}`);
  });
  writeFileSync(
    join(OUT, `risk-force-ai-economy-news${tag}.txt`),
    economyLines.join("\n") || "(no economy lines — check builds)",
  );
  console.log("ai economy lines", tag || "844", economyLines.slice(0, 6));

  // Close digest, show history with badge cleared then re-open news
  await page.locator(".rf-news__footer button").click();
  await page.waitForTimeout(200);
  await page.locator(".rf-hud__news").click();
  await page.waitForSelector(".rf-news--history");
  await page.waitForTimeout(250);
  await shot(page, `risk-force-news-history${tag}`);
}

// 844×390
{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await suite(page, "");
  await ctx.close();
}

// Desktop
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await suite(page, "-desktop");
  await ctx.close();
}

await browser.close();
console.log("Done.");
