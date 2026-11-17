#!/usr/bin/env node
/** Indonesia default-zoom minis: spaced, off-label, readable. */
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

async function prepIndonesia(page) {
  return page.evaluate(() => {
    const s = window.__RF__.getState();
    const home =
      Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0] ??
      "indonesia";
    // Force Indonesia (+ Malaysia) for the review crop.
    const indo = "indonesia";
    const malay = "malaysia";
    const territories = { ...s.territories };
    for (const id of [indo, malay]) {
      const ts = territories[id];
      if (!ts) continue;
      let buildings = [...(ts.buildings ?? [])].map((b) => ({
        ...b,
        buildRemaining: 0,
        hp: Math.max(b.hp, 200),
      }));
      if (!buildings.some((b) => b.buildingId === "command_nexus")) {
        buildings.unshift({
          instanceId: "shot_nexus",
          buildingId: "command_nexus",
          x: 0,
          y: 0,
          hp: 900,
          buildRemaining: 0,
          workers: 0,
        });
      }
      if (!buildings.some((b) => b.buildingId === "barracks")) {
        buildings.push({
          instanceId: "shot_barracks",
          buildingId: "barracks",
          x: 1,
          y: 0,
          hp: 260,
          buildRemaining: 0,
          workers: 0,
        });
      }
      if (!buildings.some((b) => b.buildingId === "reactor")) {
        buildings.push({
          instanceId: "shot_reactor",
          buildingId: "reactor",
          x: 0,
          y: 1,
          hp: 240,
          buildRemaining: 0,
          workers: 0,
        });
      }
      if (!buildings.some((b) => b.buildingId === "supply_depot")) {
        buildings.push({
          instanceId: "shot_depot",
          buildingId: "supply_depot",
          x: 1,
          y: 1,
          hp: 200,
          buildRemaining: 0,
          workers: 0,
        });
      }
      territories[id] = {
        ...ts,
        owner: "player",
        control: "core",
        occupiedTurns: 0,
        buildings: id === indo ? buildings : buildings.slice(0, 2),
        garrison:
          id === indo
            ? { trooper: 8, assault_mech: 2, hover_tank: 1 }
            : { trooper: 4 },
        garrisonHp: {},
        population: 25,
        workers: 16,
        trainingQueue: [],
      };
    }
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories,
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
    window.__RF__.dispatch({
      type: "CREATE_SQUAD",
      payload: {
        territoryId: indo,
        force: [
          { unitId: "trooper", count: 3 },
          { unitId: "assault_mech", count: 1 },
        ],
        name: "Core",
      },
    });
    // Frame Indonesia, then clear selection so panels hide.
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: indo },
    });
    return { home, indo, malay };
  });
}

async function dismissOverlays(page) {
  const news = page.locator(".rf-news__backdrop");
  if ((await news.count()) > 0) {
    await news.first().click({ force: true }).catch(() => {});
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
}

async function measureMinis(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("svg.rf-map__svg");
    const vb = svg?.viewBox?.baseVal;
    const rect = svg?.getBoundingClientRect();
    const camW = vb?.width ?? 1;
    const cssW = rect?.width ?? 1;
    // Uniform SVG scale (meet) is usually height-limited under the HUD.
    const camH = vb?.height ?? camW / 2;
    const cssH = rect?.height ?? 1;
    const pxPerWu = Math.min(cssW / camW, cssH / camH);
    const labels = [...document.querySelectorAll(".rf-map__label")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        text: el.textContent?.trim(),
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
    });
    // Building art only for size checks (units can be slightly smaller).
    const arts = [...document.querySelectorAll(".rf-map__bldg-art")].map((el) => {
      const r = el.getBoundingClientRect();
      const wuW = Number(el.getAttribute("width") || 0);
      const est = wuW * pxPerWu;
      return {
        x: r.x,
        y: r.y,
        w: Math.max(r.width, est * 0.85),
        h: Math.max(r.height, est * 0.7),
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
        est: Math.round(est),
      };
    });
    const hits = [...document.querySelectorAll(".rf-map__bldg-hit[data-instance-id], .rf-map__squad-hit, .rf-map__unit-hit")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        cls: el.getAttribute("class"),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    let labelHits = 0;
    for (const s of arts) {
      for (const l of labels) {
        if (!l.text) continue;
        if (
          s.cx > l.x &&
          s.cx < l.x + l.w &&
          s.cy > l.y &&
          s.cy < l.y + l.h
        ) {
          labelHits++;
        }
      }
    }
    const heights = arts.map((s) => s.h).sort((a, b) => a - b);
    const ests = arts.map((s) => s.est).sort((a, b) => a - b);
    const minH = heights[0] ?? 0;
    const medH = heights[Math.floor(heights.length / 2)] ?? 0;
    const medEst = ests[Math.floor(ests.length / 2)] ?? 0;
    // Span of building feet — clump detector (ignore near-neighbors on one island).
    let maxDist = 0;
    for (let i = 0; i < arts.length; i++) {
      for (let j = i + 1; j < arts.length; j++) {
        const d = Math.hypot(arts[i].cx - arts[j].cx, arts[i].cy - arts[j].cy);
        if (d > maxDist) maxDist = d;
      }
    }
    return {
      camW: Math.round(camW),
      cssW: Math.round(cssW),
      spriteCount: arts.length,
      minH: Math.round(minH),
      medH: Math.round(medH),
      medEst,
      maxDist: Math.round(maxDist),
      labelHits,
      labels: labels.map((l) => l.text),
      hitMin: hits.length ? Math.min(...hits.map((h) => Math.min(h.w, h.h))) : 0,
      drawer: !!document.querySelector(".rf-map__territory-drawer"),
      squadSheet: !!document.querySelector(".rf-map__squad-sheet"),
      rightDock: !!document.querySelector(
        ".rf-map__territory-drawer--right-dock, .rf-map__squad-sheet--right-dock, .rf-map__squad-dock",
      ),
    };
  });
}

async function captureViewport(browser, tag, viewport) {
  const page = await browser.newPage({
    viewport,
    isMobile: viewport.height <= 430,
    hasTouch: viewport.height <= 430,
  });
  await boot(page);
  await prepIndonesia(page);
  await page.waitForTimeout(500);
  await dismissOverlays(page);
  await page.evaluate(() => {
    window.__RF__.dispatch({ type: "SELECT_SQUAD", payload: { squadId: null } });
    window.__RF__.dispatch({
      type: "SELECT_TERRITORY",
      payload: { territoryId: null },
    });
  });
  await page.waitForTimeout(300);
  await dismissOverlays(page);
  const info = await measureMinis(page);
  console.log(tag, info);
  const path = join(OUT, `${tag}-indonesia-minis-spread.png`);
  await page.screenshot({ path, fullPage: false });
  console.log("saved", path);
  if (info.labelHits > 0) {
    throw new Error(`${tag}: ${info.labelHits} sprite(s) overlap label text`);
  }
  if (info.medEst < 24) {
    throw new Error(
      `${tag}: median mini ~${info.medEst}px est < 24px (box ${info.medH}px)`,
    );
  }
  if (info.spriteCount < 3) {
    throw new Error(`${tag}: expected multiple minis, got ${info.spriteCount}`);
  }
  if (info.maxDist < 80) {
    throw new Error(`${tag}: minis still clumped (maxDist ${info.maxDist}px)`);
  }
  if (info.hitMin < 38) {
    throw new Error(`${tag}: tap targets too small (hitMin ${info.hitMin}px)`);
  }
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
