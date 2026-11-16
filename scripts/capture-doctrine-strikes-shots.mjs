#!/usr/bin/env node
/**
 * Distinct screenshots for doctrines / strikes / recon / naval-air / events /
 * templates / handoff. Mobile 844×390 + desktop.
 *
 * Each named shot must show its feature (verified by file size + visual setup).
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.RF_URL ?? "http://127.0.0.1:4173/Risk-force";
const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/screenshots";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const hashes = new Map();

async function shot(page, name) {
  const path = join(TMP, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, join(OUT, `${name}.png`));
  // Also mirror followup_* aliases used in prior PR comments.
  copyFileSync(path, join(OUT, `followup_${name}.png`));
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
  await page.waitForTimeout(120);
}

async function openLobby(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // Bust PWA cache so fresh CSS (checkbox, ops row) is always used.
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
  await page.waitForTimeout(400);
  const newBtn = page.getByRole("button", { name: /New Campaign/i });
  if (await newBtn.count()) await newBtn.click();
  await page.waitForTimeout(450);
}

async function startCampaign(page) {
  await openLobby(page);
  const iron = page.getByRole("button", { name: /Ironclad/i });
  if (await iron.count()) await iron.first().click();
  await page.waitForTimeout(150);
  // Ensure VP checkbox is visible + checked for lobby shot.
  const vp = page.locator('.rf-check[role="checkbox"]');
  if (await vp.count()) {
    const on = await vp.getAttribute("aria-checked");
    if (on !== "true") await vp.click({ force: true });
  }
  await shot(
    page,
    page.viewportSize().width < 1000
      ? "mobile-lobby-doctrine"
      : "desktop-lobby-doctrine",
  );
  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.waitForTimeout(700);
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
  await page.waitForTimeout(350);
  await dismissToast(page);
}

/** Build a rich demo state; returns { home, enemy } ids. */
async function loadDemo(page, patch = {}) {
  return page.evaluate((extra) => {
    const s = window.__RF__.getState();
    const home =
      Object.entries(s.territories).find(([, t]) => t.owner === "player")?.[0] ??
      "greenland";
    const enemy =
      Object.entries(s.territories).find(
        ([id, t]) => t.owner !== "player" && id !== home,
      )?.[0] ?? "north_korea";
    const player = s.players.player;
    const tsHome = s.territories[home];
    const tsEnemy = s.territories[enemy];
    const enemyOwner = tsEnemy?.owner ?? "ai_1";

    const next = {
      ...s,
      message: null,
      screen: "map",
      phase: "play",
      selectedTerritoryId: enemy,
      handoff: null,
      newsDigest: null,
      strikeFx: [],
      plannedRoute: null,
      armiesInTransit: [],
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
          recon: [],
          strikeCooldowns: {},
          resources: {
            ...player.resources,
            energy: 900,
            alloy: 240,
            supply: 140,
          },
        },
      },
      territories: {
        ...s.territories,
        [home]: {
          ...tsHome,
          garrison: {
            trooper: 8,
            assault_mech: 2,
            cruise_launcher: 1,
            stealth_recon_drone: 1,
            orbital_strike_uplink: 1,
            drone: 2,
            patrol_hydrofoil: 3,
            dropship: 2,
          },
          buildings: [
            ...(tsHome.buildings ?? []).filter(
              (b) => b.buildingId !== "war_college",
            ),
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
        [enemy]: {
          ...tsEnemy,
          garrison: {
            trooper: 5,
            hover_tank: 2,
            aa_tank: 1,
          },
          buildings: [
            {
              instanceId: "b-en-cmd",
              buildingId: "command_nexus",
              x: 1,
              y: 1,
              hp: 700,
              buildRemaining: 0,
              workers: 0,
            },
            {
              instanceId: "b-en-shield",
              buildingId: "shield_wall",
              x: 2,
              y: 1,
              hp: 220,
              buildRemaining: 0,
              workers: 0,
            },
            {
              instanceId: "b-en-bar",
              buildingId: "barracks",
              x: 0,
              y: 2,
              hp: 180,
              buildRemaining: 0,
              workers: 0,
            },
          ],
        },
      },
      ...extra,
    };

    // Allow patching nested fields from the caller.
    if (extra.players) next.players = extra.players;
    if (extra.territories) {
      next.territories = { ...next.territories, ...extra.territories };
    }

    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: { state: next },
    });
    return { home, enemy, enemyOwner };
  }, patch);
}

async function clickOps(page, label) {
  const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
  await btn.first().click({ force: true });
  await page.waitForTimeout(250);
}

async function runViewport(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await startCampaign(page);

  // ── HUD doctrine badge ──────────────────────────────────────
  const ids = await loadDemo(page);
  await page.waitForTimeout(400);
  await dismissToast(page);
  await shot(page, `${tag}-hud-doctrine`);

  // ── (a) Strike targeting UI with cost + cooldown ────────────
  await page.evaluate(({ enemy }) => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          selectedTerritoryId: enemy,
          screen: "map",
          strikeFx: [],
          message: null,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              recon: [],
              strikeCooldowns: { kinetic: 2 },
            },
          },
        },
      },
    });
  }, ids);
  await page.waitForTimeout(350);
  await dismissToast(page);
  await clickOps(page, "Strike");
  await shot(page, `${tag}-strike-targeting`);

  // ── (b) Strike FX mid-impact — cruise / orbital / kinetic ───
  // Close any open strike panel so FX sits clear on the map.
  const strikeBtn = page.getByRole("button", { name: /^Strike$/i });
  if (await strikeBtn.count()) {
    const pressed = await strikeBtn.first().evaluate(
      (el) => el.classList.contains("primary"),
    );
    if (pressed) await strikeBtn.first().click({ force: true });
  }
  for (const kind of ["cruise", "orbital", "kinetic"]) {
    await page.evaluate(
      ({ enemy, kind }) => {
        const s = window.__RF__.getState();
        window.__RF__.dispatch({
          type: "LOAD_STATE",
          payload: {
            state: {
              ...s,
              selectedTerritoryId: enemy,
              opsMode: null,
              strikeFx: [
                {
                  id: `sfx-${kind}`,
                  kind,
                  territoryId: enemy,
                  turn: s.turn,
                  createdAt: Date.now(),
                },
              ],
            },
          },
        });
      },
      { enemy: ids.enemy, kind },
    );
    // Catch mid-impact (~0.45s into a ~1.6s loop).
    await page.waitForTimeout(480);
    await shot(page, `${tag}-strike-fx-${kind}`);
    if (kind === "orbital") {
      // Legacy alias (same pixels as orbital mid-impact).
      const src = join(TMP, `${tag}-strike-fx-orbital.png`);
      copyFileSync(src, join(OUT, `${tag}-strike-fx.png`));
      copyFileSync(src, join(OUT, `followup_${tag}-strike-fx.png`));
    }
  }

  // ── (c) Aftermath: damaged buildings / shields down ─────────
  await page.evaluate(({ enemy }) => {
    const s = window.__RF__.getState();
    const et = s.territories[enemy];
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          selectedTerritoryId: enemy,
          strikeFx: [],
          territories: {
            ...s.territories,
            [enemy]: {
              ...et,
              buildings: (et.buildings ?? []).map((b) => {
                if (b.buildingId === "shield_wall") {
                  return { ...b, hp: 0 };
                }
                if (b.buildingId === "barracks") {
                  return { ...b, hp: Math.max(20, Math.floor(b.hp * 0.45)) };
                }
                if (b.buildingId === "command_nexus") {
                  return { ...b, hp: Math.max(80, Math.floor(b.hp * 0.62)) };
                }
                return b;
              }),
            },
          },
        },
      },
    });
  }, ids);
  await page.waitForTimeout(350);
  await dismissToast(page);
  await shot(page, `${tag}-strike-aftermath`);

  // ── (d1) Approx garrison before recon ───────────────────────
  await page.evaluate(({ enemy }) => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          selectedTerritoryId: enemy,
          armiesInTransit: [],
          players: {
            ...s.players,
            player: { ...s.players.player, recon: [] },
          },
        },
      },
    });
  }, ids);
  await page.waitForTimeout(350);
  await dismissToast(page);
  await shot(page, `${tag}-recon-approx`);

  // ── (d2) Exact after recon + revealed incoming marches ──────
  await page.evaluate(({ enemy, home, enemyOwner }) => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          selectedTerritoryId: enemy,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
              recon: [
                {
                  targetTerritoryId: enemy,
                  targetFactionId: enemyOwner,
                  untilTurn: s.turn + 4,
                  mode: "drone",
                },
              ],
            },
          },
          armiesInTransit: [
            {
              id: "march-in",
              owner: enemyOwner,
              fromId: home,
              toId: enemy,
              force: [
                { unitId: "trooper", count: 4 },
                { unitId: "hover_tank", count: 1 },
              ],
              turnsRemaining: 2,
              totalTurns: 3,
            },
          ],
        },
      },
    });
  }, ids);
  await page.waitForTimeout(400);
  await dismissToast(page);
  await shot(page, `${tag}-recon-reveal`);

  // ── Labels / multi minis at mid zoom over Asia ──────────────
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const focus = [
      "china_west",
      "china_east",
      "kazakhstan",
      "india_east",
      "india_west",
      "mongolia",
      "siberia",
    ];
    const territories = { ...s.territories };
    for (const id of focus) {
      if (!territories[id]) continue;
      const prev = territories[id];
      territories[id] = {
        ...prev,
        owner: id === "china_west" || id === "mongolia" || id === "siberia"
          ? "player"
          : prev.owner,
        garrison: {
          trooper: 6,
          hover_tank: 2,
          assault_mech: 1,
          drone: 2,
          aa_tank: 1,
        },
        buildings: [
          {
            instanceId: `${id}-cmd`,
            buildingId: "command_nexus",
            x: 1,
            y: 1,
            hp: 600,
            buildRemaining: 0,
            workers: 0,
          },
          {
            instanceId: `${id}-bar`,
            buildingId: "barracks",
            x: 0,
            y: 2,
            hp: 200,
            buildRemaining: 0,
            workers: 0,
          },
          {
            instanceId: `${id}-vf`,
            buildingId: "vehicle_factory",
            x: 2,
            y: 0,
            hp: 240,
            buildRemaining: 0,
            workers: 0,
          },
          {
            instanceId: `${id}-af`,
            buildingId: "airfield",
            x: 2,
            y: 2,
            hp: 220,
            buildRemaining: 0,
            workers: 0,
          },
        ],
      };
    }
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          territories,
          selectedTerritoryId: "china_west",
          armiesInTransit: [],
          strikeFx: [],
          screen: "map",
        },
      },
    });
  });
  await page.waitForTimeout(550);
  await dismissToast(page);
  await shot(page, `${tag}-labels-chips`);
  await shot(page, `${tag}-asia-mid-minis`);

  // ── News / theater event ────────────────────────────────────
  await page.evaluate(() => window.__RF__?.openNews?.());
  await page.waitForTimeout(350);
  await shot(page, `${tag}-event-news`);
  await page.evaluate(() => {
    window.__RF__?.closeNews?.();
    window.__RF__.dispatch({ type: "MARK_NEWS_READ" });
    window.__RF__.dispatch({ type: "DISMISS_NEWS_DIGEST" });
  });
  await page.waitForTimeout(200);

  // ── Template + commander with real garrison ─────────────────
  // Seed-77 solo gives the human most of the map; pin a small owned set so
  // Launch-from is Greenland with a fat garrison and Iceland is an enemy target.
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const home = "greenland";
    const target = "iceland";
    const enemyOwner =
      Object.keys(s.players).find((id) => id !== "player") ?? "ai_1";
    const territories = { ...s.territories };
    for (const [id, ts] of Object.entries(territories)) {
      if (id === home) {
        territories[id] = {
          ...ts,
          owner: "player",
          garrison: {
            trooper: 8,
            assault_mech: 2,
            drone: 2,
            patrol_hydrofoil: 3,
            dropship: 2,
            cruise_launcher: 1,
            orbital_strike_uplink: 1,
            stealth_recon_drone: 1,
          },
        };
      } else if (id === "japan" || id === "usa_west") {
        territories[id] = {
          ...ts,
          owner: "player",
          garrison: { trooper: 2, dropship: 2, patrol_hydrofoil: 2 },
        };
      } else {
        territories[id] = {
          ...ts,
          owner: enemyOwner,
          garrison: ts.garrison?.trooper
            ? ts.garrison
            : { trooper: 2, hover_tank: 1 },
        };
      }
    }
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
          armiesInTransit: [],
          plannedRoute: null,
          strikeFx: [],
          territories,
          players: {
            ...s.players,
            player: {
              ...s.players.player,
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
            },
          },
        },
      },
    });
    return { home, target };
  });
  await page.waitForTimeout(600);
  // Ensure Launch-from is Greenland (PickerList order ≠ Object.entries).
  const greenlandOpt = page.getByRole("button", { name: /Greenland/i });
  if (await greenlandOpt.count()) {
    await greenlandOpt.first().click({ force: true });
    await page.waitForTimeout(200);
  }
  const icelandOpt = page.getByRole("button", { name: /Iceland/i });
  if (await icelandOpt.count()) {
    await icelandOpt.first().click({ force: true });
    await page.waitForTimeout(200);
  }
  const tpl = page.getByRole("button", { name: /Vanguard push/i });
  if (await tpl.count()) {
    await tpl.first().click({ force: true });
    await page.waitForTimeout(250);
  }
  // Ensure unit rows (not just the template chip) are on-screen.
  const unitRow = page.locator(".rf-invade__force li").first();
  if (await unitRow.count()) {
    await unitRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  await shot(page, `${tag}-template-commander`);

  // ── Naval sea-lane route + air/dropship jump on the map ─────
  // Keep both routes in the North Atlantic frame (greenland↔iceland naval,
  // iceland→britain air jump) so the shot is not a duplicate of invade UI.
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    const navalFrom = "greenland";
    const navalTo = "iceland";
    const airFrom = "iceland";
    const airTo = "united_kingdom";
    const owner = "player";
    const enemyOwner =
      Object.keys(s.players).find((id) => id !== "player") ?? "ai_1";
    const territories = { ...s.territories };
    for (const [id, ts] of Object.entries(territories)) {
      if (id === navalFrom || id === "usa_west") {
        territories[id] = {
          ...ts,
          owner,
          garrison: {
            trooper: 4,
            patrol_hydrofoil: 3,
            dropship: 2,
          },
        };
      } else {
        territories[id] = { ...ts, owner: enemyOwner };
      }
    }
    // Iceland stays enemy destination for naval; also origin for air jump paint.
    territories[airFrom] = {
      ...territories[airFrom],
      owner,
      garrison: { dropship: 2 },
    };
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          screen: "map",
          selectedTerritoryId: null,
          territories,
          plannedRoute: [navalFrom, navalTo],
          armiesInTransit: [
            {
              id: "naval-lane",
              owner,
              fromId: navalFrom,
              toId: navalTo,
              force: [{ unitId: "patrol_hydrofoil", count: 3 }],
              turnsRemaining: 2,
              totalTurns: 3,
            },
            {
              id: "air-jump",
              owner,
              fromId: airFrom,
              toId: airTo,
              force: [{ unitId: "dropship", count: 2 }],
              turnsRemaining: 1,
              totalTurns: 1,
            },
          ],
          strikeFx: [],
          message: null,
          handoff: null,
        },
      },
    });
  });
  await page.waitForTimeout(350);
  await dismissToast(page);
  // Zoom out so both North Atlantic routes are visible.
  const map = page.locator(".rf-map svg, svg.rf-map__svg, .rf-main svg").first();
  if (await map.count()) {
    const box = await map.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(40);
      }
    }
  }
  await page.waitForTimeout(250);
  await shot(page, `${tag}-naval-air-layer`);

  // ── Hot-seat handoff ────────────────────────────────────────
  await page.evaluate(() => {
    const s = window.__RF__.getState();
    window.__RF__.dispatch({
      type: "LOAD_STATE",
      payload: {
        state: {
          ...s,
          multiplayerMode: "hotseat",
          screen: "map",
          armiesInTransit: [],
          plannedRoute: null,
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
  const report = [...hashes.entries()].map(([n, h]) => `${n} ${h.slice(0, 12)}`);
  writeFileSync(join(OUT, "doctrine-shots-hashes.txt"), report.join("\n"));
  console.log("done —", hashes.size, "distinct shots");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
