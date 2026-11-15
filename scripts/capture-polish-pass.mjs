#!/usr/bin/env node
/**
 * Polish-pass shots: deep/mid/world (Europe), invade panel scroll, research.
 * Viewports: 844x390 + 1280x800.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:5173/Risk-force/";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots-polish-pass";
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
  await page.waitForTimeout(350);
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
    for (const [id, ts] of Object.entries(s.territories)) {
      if (ts.owner !== "player") continue;
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
          trooper: 5,
          jumpjet_trooper: 2,
          hover_tank: 2,
          aa_tank: 1,
          railgun_walker: 1,
          emp_disruptor: 1,
          stealth_recon_drone: 2,
          heavy_siege_mech: 1,
          airlift_dropship: 1,
        },
      };
    }
    if (fromId) {
      territories[fromId] = {
        ...territories[fromId],
        garrison: {
          trooper: 8,
          jumpjet_trooper: 4,
          aa_tank: 2,
          railgun_walker: 2,
          emp_disruptor: 2,
          heavy_siege_mech: 1,
          stealth_recon_drone: 2,
          airlift_dropship: 1,
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
                supply: 120,
                energy: 800,
                alloy: 500,
                research: 400,
              },
            },
          },
        },
      },
    });
    return { fromId, toId };
  }, RESEARCH);
}

async function dismissToasts(page) {
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "DISMISS_MESSAGE" });
    window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
  });
  const dismiss = page.locator('button:has-text("Dismiss")');
  if (await dismiss.count()) {
    await dismiss.first().click().catch(() => {});
  }
  await page.waitForTimeout(150);
}

async function suite(page, tag) {
  await boot(page);
  const ids = await seed(page);
  console.log("seed", tag, ids);
  await dismissToasts(page);

  const svgBox = await page.locator(".rf-map__svg").boundingBox();

  // ---- World over Europe ----
  await page.evaluate(() => {
    // Reset camera via selecting nothing then zooming out
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await wheelAt(
    page,
    svgBox.x + svgBox.width * 0.55,
    svgBox.y + svgBox.height * 0.42,
    220,
    40,
  );
  await page.waitForTimeout(300);
  // Pan toward Europe: zoom lightly then pan via wheel on Europe region
  // Select germany/france area by clicking if possible; else frame via select iceland then zoom out
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: "germany" },
    });
  });
  await page.waitForTimeout(400);
  // Zoom out from mid focus to world-ish while keeping Europe framed
  await wheelAt(
    page,
    svgBox.x + svgBox.width * 0.5,
    svgBox.y + svgBox.height * 0.45,
    160,
    18,
  );
  await page.waitForTimeout(350);
  await dismissToasts(page);
  await shot(page, `risk-force-unit-minis-world${tag}`);
  await shot(page, `risk-force-map-bldgs-world${tag}`);

  // ---- Mid on Greenland ----
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, ids.fromId ?? "greenland");
  await page.waitForTimeout(500);
  await dismissToasts(page);
  await shot(page, `risk-force-unit-minis-mid${tag}`);
  await shot(page, `risk-force-map-bldgs-mid${tag}`);

  // ---- Deep ----
  const pt = await page.evaluate(() => {
    const t = [...document.querySelectorAll("text")].find((x) =>
      /Greenland/i.test(x.textContent || ""),
    );
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const zx = pt?.x ?? svgBox.x + svgBox.width * 0.4;
  const zy = pt?.y ?? svgBox.y + svgBox.height * 0.45;
  await wheelAt(page, zx, zy, -160, 30);
  await page.waitForTimeout(450);
  await dismissToasts(page);
  const deepInfo = await page.evaluate(() => {
    const vb = document
      .querySelector(".rf-map__svg")
      .getAttribute("viewBox")
      .split(/[\s,]+/)
      .map(Number);
    const units = [
      ...document.querySelectorAll(".rf-map__units image"),
    ].filter((i) =>
      i.closest("g")?.querySelector('[data-territory-id="greenland"]'),
    );
    const bldg = [...document.querySelectorAll(".rf-map__bldgs image")].map(
      (i) => Math.round(i.getBoundingClientRect().width),
    );
    return {
      cw: vb[2],
      units: units.length,
      sizes: units.map((i) => Math.round(i.getBoundingClientRect().width)),
      bldg: bldg.slice(0, 3),
    };
  });
  console.log("deep", tag, deepInfo);
  await shot(page, `risk-force-unit-minis-deep${tag}`);
  await shot(page, `risk-force-map-bldgs-deep${tag}`);

  // ---- Invade panel (source list + confirm visible) ----
  await page.evaluate((tid) => {
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: tid },
    });
  }, ids.toId);
  await page.waitForTimeout(450);
  await dismissToasts(page);
  // Open drawer on short landscape if needed
  const sheet = page.locator(".rf-map__sheet-toggle, .rf-drawer--right").first();
  const invadeBtn = page.locator('button:has-text("Invade")');
  if (!(await invadeBtn.count())) {
    // try opening detail
    await page.evaluate((tid) => {
      window.__RF__.dispatch({
        type: "SELECT_TERRITORY",
        payload: { territoryId: tid },
      });
    }, ids.toId);
    await page.waitForTimeout(300);
  }
  if (await invadeBtn.count()) {
    await invadeBtn.first().click();
    await page.waitForTimeout(450);
    await dismissToasts(page);
    // Scroll invade body so source + confirm are in view
    await page.evaluate(() => {
      const body = document.querySelector(".rf-invade-from__body");
      const footer = document.querySelector(".rf-invade-from__footer");
      body?.scrollTo?.(0, 0);
      footer?.scrollIntoView?.({ block: "nearest" });
      const origin = document.querySelector(".rf-invade-from__origins li");
      origin?.scrollIntoView?.({ block: "nearest" });
    });
    await page.waitForTimeout(250);
    await shot(page, `risk-force-invade-picker${tag}`);
    // Also shoot with confirm in view
    await page.evaluate(() => {
      document
        .querySelector(".rf-invade-from__footer")
        ?.scrollIntoView?.({ block: "end" });
    });
    await page.waitForTimeout(200);
    await shot(page, `risk-force-invade-confirm${tag}`);
  } else {
    console.warn("no Invade button", tag);
  }

  // ---- Research: toast dismissed, new unit techs visible ----
  await page.evaluate(() => {
    window.__RF__.dispatch({
      type: "SET_SCREEN",
      payload: { screen: "research" },
    });
  });
  await page.waitForTimeout(450);
  await dismissToasts(page);
  await page.evaluate(() => {
    const prefer =
      /Jump-Jet Doctrine|Rail Walker Frames|EMP Field Ops|Siege Mech Corps|Theater Airlift|Orbital Fire|Elite Ops|AA Doctrine|Stealth Recon/i;
    const el = [...document.querySelectorAll("button, li, div")].find((n) =>
      prefer.test((n.textContent || "").slice(0, 100)),
    );
    el?.scrollIntoView?.({ block: "center", inline: "nearest" });
  });
  await page.waitForTimeout(300);
  await dismissToasts(page);
  // Prefer infantry / jump-jet / rail walker nodes in view
  await page.evaluate(() => {
    const hit = [...document.querySelectorAll("button, li")].find((n) =>
      /Jump-Jet Doctrine|Rail Walker|EMP Field Ops|Elite Ops|Theater Airlift/i.test(
        (n.textContent || "").slice(0, 90),
      ),
    );
    hit?.scrollIntoView?.({ block: "center" });
    const scrollables = [...document.querySelectorAll("*")].filter(
      (el) =>
        el.scrollHeight > el.clientHeight + 40 &&
        /Doctrine|Jump-Jet|Infantry|Armor/i.test(el.textContent || ""),
    );
    for (const el of scrollables.slice(0, 3)) {
      const child = [...el.querySelectorAll("*")].find((c) =>
        /Jump-Jet Doctrine|Rail Walker Frames/i.test(c.textContent || ""),
      );
      if (child) {
        child.scrollIntoView({ block: "center" });
        break;
      }
    }
  });
  await page.waitForTimeout(350);
  await dismissToasts(page);
  await shot(page, `risk-force-research-new-units${tag}`);
}

{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await suite(page, "");
  await ctx.close();
}

{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  await suite(page, "-desktop");
  await ctx.close();
}

await browser.close();
console.log("Done");
