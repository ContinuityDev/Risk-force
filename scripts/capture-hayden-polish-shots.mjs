#!/usr/bin/env node
/**
 * Proof shots for Hayden polish: building/unit minis zooms, invade flow,
 * transit armies, research + train menus for new units.
 * Viewports: 844x390 + 1280x800.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:5173/Risk-force/";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-hayden-polish";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const RESEARCH = [
  "jumpjet_doctrine",
  "rail_walker_frames",
  "emp_field_ops",
  "siege_mech_corps",
  "stealth_recon",
  "aa_doctrine",
  "theater_airlift",
  "orbital_fire_control",
  "elite_ops",
  "infantry_doctrine",
  "spec_ops",
  "mech_corps",
  "walker_chassis",
  "mass_drivers",
  "emp_warfare",
  "electronic_warfare",
  "cyber_doctrine",
  "titan_frames",
  "siege_protocols",
  "drone_swarm",
  "sensor_fusion",
  "grav_armor",
  "point_defense_grid",
  "orbital_defense",
  "heavy_airlift",
  "theater_logistics",
  "supply_chains",
  "field_repair",
  "orbital_weapons",
  "orbital_uplink",
  "cyber_infantry",
  "nano_industry",
  "plasma_doctrine",
];

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  console.log("saved", name);
}

function wheelAt(page, x, y, dy, n) {
  return page.evaluate(
    ({ x, y, dy, n }) => {
      const el = document.querySelector(".rf-map__svg");
      for (let i = 0; i < n; i++) {
        el.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            deltaY: dy,
          }),
        );
      }
    },
    { x, y, dy, n },
  );
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator(".rf-menu button.primary").click();
  await page.waitForSelector(".rf-lobby");
  await page.locator(".rf-lobby button.primary").click();
  await page.waitForSelector(".rf-map");
  await page.waitForFunction(() => window.__RF__?.neighbors, null, {
    timeout: 20000,
  });
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "NEW_GAME",
      payload: {
        humanCount: 1,
        aiCount: 2,
        multiplayerMode: "solo",
        seed: 77,
      },
    });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
  });
}

async function seed(page) {
  return page.evaluate((research) => {
    const s = window.__RF__.getState();
    const neigh = window.__RF__.neighbors;
    let fromId = null;
    let toId = null;
    let coreId = null;
    for (const [id, ts] of Object.entries(s.territories)) {
      if (ts.owner !== "player") continue;
      if ((ts.buildings?.length ?? 0) >= 5 && !coreId) coreId = id;
      for (const n of neigh[id] || []) {
        if (s.territories[n]?.owner && s.territories[n].owner !== "player") {
          fromId = id;
          toId = n;
          break;
        }
      }
      if (fromId) break;
    }
    const territories = { ...s.territories };
    for (const [tid, ts] of Object.entries(territories)) {
      if (ts.owner !== "player") continue;
      territories[tid] = {
        ...ts,
        garrison: {
          trooper: 4,
          jumpjet_trooper: 2,
          aa_tank: 1,
          railgun_walker: 1,
          emp_disruptor: 1,
          heavy_siege_mech: 1,
          stealth_recon_drone: 2,
          airlift_dropship: 1,
          elite_commando: 1,
        },
        buildings: [
          ...(ts.buildings ?? []),
          // Ensure a barracks + vehicle factory + airfield for train shots
        ],
      };
    }
    // Guarantee training buildings on core (valid PlacedBuilding shape)
    const ensureBldg = (tid, buildingId, instanceId, x, y) => {
      const ts = territories[tid];
      if (!ts) return;
      if (ts.buildings.some((b) => b.buildingId === buildingId)) return;
      territories[tid] = {
        ...ts,
        buildings: [
          ...ts.buildings,
          {
            instanceId,
            buildingId,
            x,
            y,
            buildRemaining: 0,
            workers: 2,
            hp: 280,
          },
        ],
      };
    };
    const trainCore = coreId ?? fromId;
    if (trainCore) {
      ensureBldg(trainCore, "barracks", "shot_barracks", 1, 4);
      ensureBldg(trainCore, "vehicle_factory", "shot_vfact", 2, 3);
      ensureBldg(trainCore, "airfield", "shot_air", 0, 3);
      ensureBldg(trainCore, "uplink_array", "shot_uplink", 3, 1);
    }
    if (fromId) {
      territories[fromId] = {
        ...territories[fromId],
        garrison: {
          trooper: 6,
          jumpjet_trooper: 3,
          aa_tank: 2,
          railgun_walker: 2,
          emp_disruptor: 2,
          heavy_siege_mech: 1,
          stealth_recon_drone: 2,
          airlift_dropship: 1,
          elite_commando: 1,
        },
      };
    }
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
          armiesInTransit: [],
          activePlayerIndex: 0,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              researched: Array.from(
                new Set([
                  ...(s.players.player.researched ?? []),
                  ...research,
                ]),
              ),
              resources: {
                ...s.players.player.resources,
                supply: 140,
                energy: 900,
                alloy: 600,
                research: 400,
              },
            },
          },
        },
      },
    });
    return { fromId, toId, trainCore };
  }, RESEARCH);
}

async function zoomOnSelected(page, times) {
  const box = await page.locator(".rf-map__svg").boundingBox();
  if (!box) return;
  const pt = await page.evaluate(() => {
    const sel = window.__RF__.getState().selectedTerritoryId;
    // Map path highlight is the selected territory — use its bbox center
    const path =
      document.querySelector(`.rf-map__territory.is-selected`) ||
      document.querySelector(`.rf-map__territory[data-territory-id="${sel}"]`);
    if (path) {
      const r = path.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) {
        return { x: r.x + r.width * 0.4, y: r.y + r.height * 0.45 };
      }
    }
    const texts = [...document.querySelectorAll(".rf-map text")];
    const hit = texts.find((t) => (t.textContent || "").length > 2);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await wheelAt(
    page,
    pt?.x ?? box.x + box.width * 0.38,
    pt?.y ?? box.y + box.height * 0.45,
    -120,
    times,
  );
  await page.waitForTimeout(350);
}

async function suite(page, tag) {
  await boot(page);
  const ids = await seed(page);
  console.log("seed", tag, ids);

  // ---- Building + unit minis world/mid/deep ----
  const svgBox = await page.locator(".rf-map__svg").boundingBox();
  await wheelAt(page, svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2, 200, 50);
  await page.waitForTimeout(400);
  await shot(page, `risk-force-map-bldgs-world${tag}`);
  await shot(page, `risk-force-unit-minis-world${tag}`);

  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, ids.trainCore ?? ids.fromId);
  await page.waitForTimeout(450);
  // Territory select focuses to ~0.32 zoomScale (mid tier). Extra wheels → deep.
  await shot(page, `risk-force-map-bldgs-mid${tag}`);
  await shot(page, `risk-force-unit-minis-mid${tag}`);
  await zoomOnSelected(page, tag.includes("desktop") ? 32 : 28);
  await shot(page, `risk-force-map-bldgs-deep${tag}`);
  await shot(page, `risk-force-unit-minis-deep${tag}`);

  // ---- Invade flow ----
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, ids.toId);
  await page.waitForTimeout(500);
  await shot(page, `risk-force-invade-button${tag}`);
  const invadeBtn = page.locator('button:has-text("Invade")');
  if (await invadeBtn.count()) {
    await invadeBtn.first().click();
    await page.waitForTimeout(450);
    await shot(page, `risk-force-invade-picker${tag}`);
    await shot(page, `risk-force-invade-arrows${tag}`);
    const confirm = page.locator('button:has-text("Confirm invasion")');
    if (await confirm.count()) {
      await confirm.first().click();
      await page.waitForTimeout(500);
      await shot(page, `risk-force-invade-march${tag}`);
      await shot(page, `risk-force-transit-armies${tag}`);
    }
  }

  // ---- Research ----
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SET_SCREEN",
      payload: { screen: "research" },
    });
  });
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, li")].find((n) =>
      /Jump-Jet|Rail Walker|EMP Field|Siege Mech|Stealth Recon|AA Doctrine|Theater Airlift|Orbital Fire|Elite Ops/i.test(
        (n.textContent || "").slice(0, 100),
      ),
    );
    el?.scrollIntoView?.({ block: "center" });
  });
  await page.waitForTimeout(250);
  await shot(page, `risk-force-research-new-units${tag}`);

  // ---- Train menus ----
  for (const [buildingId, label] of [
    ["barracks", "barracks"],
    ["vehicle_factory", "vehicle"],
    ["airfield", "airfield"],
  ]) {
    await page.evaluate((tid) => {
      window.__RF__.dispatch({
        type: "LOAD_STATE",
        payload: {
          state: {
            ...window.__RF__.getState(),
            selectedTerritoryId: tid,
            screen: "base",
            phase: "play",
            message: null,
            newsDigest: null,
          },
        },
      });
    }, ids.trainCore ?? ids.fromId);
    await page.waitForTimeout(500);
    const clicked = await page.evaluate((buildingId) => {
      const s = window.__RF__.getState();
      const tid = s.selectedTerritoryId;
      const b = s.territories[tid]?.buildings.find(
        (x) => x.buildingId === buildingId,
      );
      if (!b) return false;
      const CELL = window.matchMedia(
        "(orientation: landscape) and (max-height: 500px)",
      ).matches
        ? 52
        : 84;
      const pad = [...document.querySelectorAll(".rf-base__pad")].find((el) => {
        const left = parseInt(el.style.left, 10);
        const top = parseInt(el.style.top, 10);
        return left === b.x * CELL && top === b.y * CELL;
      });
      pad?.click();
      return !!pad;
    }, buildingId);
    if (clicked) {
      try {
        await page.waitForSelector(".rf-base__ctx", { timeout: 4000 });
        await page.locator('.rf-base__ctx button:has-text("Train")').click();
        await page.waitForTimeout(400);
        await page.evaluate((buildingId) => {
          const prefer = {
            barracks: /Jump-Jet|Elite Commando/i,
            vehicle_factory: /Rail-Gun|EMP Disruptor|Heavy Siege|AA Point/i,
            airfield: /Airlift|Stealth Recon/i,
          }[buildingId];
          const el = [
            ...document.querySelectorAll(".rf-base__train-list li, button"),
          ].find((n) => prefer?.test((n.textContent || "").slice(0, 80)));
          el?.scrollIntoView?.({ block: "center" });
        }, buildingId);
        await page.waitForTimeout(250);
      } catch (e) {
        console.warn("train open failed", label, e.message);
      }
    }
    console.log("train click", label, clicked);
    await shot(page, `risk-force-train-${label}${tag}`);
  }

  // ---- Battle with new units ----
  await page.evaluate(({ toId }) => {
    const s = window.__RF__.getState();
    const force = [
      { unitId: "jumpjet_trooper", count: 3 },
      { unitId: "railgun_walker", count: 1 },
      { unitId: "emp_disruptor", count: 1 },
      { unitId: "aa_tank", count: 1 },
      { unitId: "heavy_siege_mech", count: 1 },
      { unitId: "elite_commando", count: 2 },
    ];
    const battle = window.__RF__.createBattle(s, toId, "player", force);
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          battle,
          phase: "battle",
          screen: "battle",
          message: null,
          newsDigest: null,
        },
      },
    });
  }, ids);
  await page.waitForTimeout(500);
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() =>
      window.__RF__.dispatch({ type: "BATTLE_TICK", payload: { dt: 0.12 } }),
    );
  }
  await page.waitForTimeout(200);
  await shot(page, `risk-force-battle-new-units${tag}`);
}

{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  await suite(await ctx.newPage(), "");
  await ctx.close();
}
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await suite(await ctx.newPage(), "-desktop");
  await ctx.close();
}

await browser.close();
console.log("Done");
