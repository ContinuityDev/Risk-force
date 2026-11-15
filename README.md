# Risk Force

Near-future military sci-fi war simulator for the browser. **Earth, late 22nd century** — a Risk-style continental map where you fortify territories with laser turrets and reactors, research doctrine across a deep tech tree, and launch strike forces of mechs, hover tanks, and drones.

## Stack

- Vite + React 19 + TypeScript
- Vitest for engine tests
- Original SVG sprites (no copyrighted assets)
- Pure serializable game state + action reducer (save/load, hot-seat, LAN-ready)

No Phaser/Pixi — React + SVG keeps the stack aligned with sibling projects and makes sprites trivial to edit. Battle animation uses the live battle state (projectiles, explosions, unit/structure anim flags).

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm test
```

### LAN multiplayer (optional)

One player hosts a thin WebSocket relay:

```bash
npm run lan-host   # prints ws://<lan-ip>:3847
```

Others open the game → **LAN** → enter `host-ip:3847` → Connect → Start. Architecture uses a shared `Transport` interface (`local` | `lan`); online can implement the same contract later.

## How to play

1. **New Campaign** (solo vs AI), **Hot-Seat** (several humans on one device), or **LAN**.
2. **Map** — select a territory you own. Colors are faction-coded (placeholder names in `src/data/factions.ts`).
3. **Base** — place economy (reactors, refineries, fabricators, supply) and defenses (shield pylons, lasers, plasma bunkers, railguns, flak…) on the grid.
4. **Research** — unlock branches: infantry, armor, air, naval, orbital, cyber, energy weapons, defenses, economy, logistics.
5. **Recruit / Invade** — build a strike force from reserves, spend **supply**, attack an adjacent enemy territory.
6. Watch the **battle** resolve with lasers, plasma, EMP, and explosions. Capture on victory.
7. **End Turn** — income and construction advance; AI opponents act automatically.
8. **Save** — five localStorage slots, plus JSON export/import.

Resources: **Energy**, **Alloy**, **Research**, **Supply**.

## Architecture (multiplayer-ready)

| Piece | Role |
|-------|------|
| `GameState` | Fully JSON-serializable snapshot |
| `GameAction` | Command objects only — no hidden mutation |
| `reduce(state, action)` | Pure reducer |
| `Transport` | `getState` / `subscribe` / `dispatch` — local hot-seat or LAN |
| `src/persistence/saves.ts` | Slots + export/import |

## Faction names

Edit **`src/data/factions.ts`** only — `FACTION_NAMES` / `FACTION_COLORS`. Engine code uses ids (`player`, `faction_a`, …).

## Adding a unit or building

Definitions are data-only. Example — new infantry unit:

1. Drop a sprite at `public/sprites/units/unit-spectre.svg`.
2. Append to `src/data/units/index.ts`:

```ts
spectre: {
  id: "spectre",
  name: "Spectre Operative",
  description: "Low-signature infiltrator with EMP charges.",
  role: "infantry",
  cost: { energy: 70, alloy: 20 },
  maxHp: 90,
  damage: 18,
  damageType: "emp",
  armorType: "light",
  armorPierce: { shielded: 1.4 },
  range: 1.9,
  speed: 1.5,
  fireRate: 1.1,
  targetPreference: "ground",
  projectile: "emp",
  supplyCost: 2,
  requiresResearch: "cyber_warfare_i",
  sprite: { id: "unit-spectre", frameW: 32, frameH: 32 },
  anims: {
    idle: { frames: 2, fps: 3 },
    move: { frames: 4, fps: 8 },
    attack: { frames: 3, fps: 10 },
    hit: { frames: 2, fps: 10 },
    destroyed: { frames: 4, fps: 10 },
  },
},
```

3. Add a research node (or leave `requiresResearch` unset for always-available):

```ts
cyber_warfare_i: {
  id: "cyber_warfare_i",
  name: "Cyber Warfare I",
  description: "Unlock Spectre Operatives.",
  branch: "cyber",
  cost: 45,
  prerequisites: [],
  unlocks: ["spectre"],
},
```

Buildings work the same way in `src/data/buildings/index.ts` (set `output` for economy or `damage`/`range`/`fireRate` for defenses). No engine changes required.

## Project layout

```
src/data/          units, buildings, research, map, factions, combat matrix
src/engine/        state, actions, reducer, economy, combat, research, AI
src/net/           Transport + local + LAN client
src/persistence/   save slots / JSON export
src/components/    map, base, research, invade, battle, lobby, saves
public/sprites/    original SVG art
server/lan-host.mjs
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview build |
| `npm test` | Vitest (economy, combat, research, reducer) |
| `npm run lan-host` | LAN WebSocket host |
