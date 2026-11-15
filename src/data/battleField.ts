/**
 * Tunable battle-field geometry. World units map 1:1 onto the playable
 * ground plane (no sky band inside these bounds).
 */

export const BATTLE_FIELD = {
  /** Playable width in world units. */
  width: 14,
  /** Playable height in world units (full ground plane). */
  height: 8,

  /** Hard clamp margin so sprites stay on the dirt. */
  margin: 0.35,

  /** Attacker deployment strip (left edge). */
  attackerDeploy: {
    x0: 0.45,
    x1: 3.15,
    y0: 0.7,
    y1: 7.3,
  },

  /** No-man's-land between the lines — empty at battle start. */
  noMansLand: {
    x0: 3.15,
    x1: 7.0,
    y0: 0.7,
    y1: 7.3,
  },

  /**
   * Defender base zone (right). Buildings map into the rear of this
   * rectangle; garrison stands in the front strip (see garrisonZone).
   */
  defenderZone: {
    x0: 7.0,
    x1: 13.5,
    y0: 0.7,
    y1: 7.3,
  },

  /**
   * Garrison stands inside the defender zone tint, in front of buildings
   * — never in no-man's-land (avoids “ghost unit” misreads).
   */
  garrisonZone: {
    x0: 7.15,
    x1: 8.35,
    y0: 0.85,
    y1: 7.15,
  },
} as const;

export type BattleRect = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

export function fieldBounds() {
  const m = BATTLE_FIELD.margin;
  return {
    minX: m,
    maxX: BATTLE_FIELD.width - m,
    minY: m,
    maxY: BATTLE_FIELD.height - m,
  };
}

/** Clamp a world point onto the playable ground plane. */
export function clampToGround(x: number, y: number): { x: number; y: number } {
  const b = fieldBounds();
  return {
    x: Math.min(b.maxX, Math.max(b.minX, x)),
    y: Math.min(b.maxY, Math.max(b.minY, y)),
  };
}

/** Clamp into an arbitrary zone rectangle (also ground-safe). */
export function clampToZone(
  x: number,
  y: number,
  zone: BattleRect,
): { x: number; y: number } {
  const gx = Math.min(zone.x1, Math.max(zone.x0, x));
  const gy = Math.min(zone.y1, Math.max(zone.y0, y));
  return clampToGround(gx, gy);
}

/**
 * Map a base-grid cell (and building footprint) onto the defender battle zone.
 * Preserves relative layout from the territory's base grid.
 */
export function mapBaseCellToBattle(
  cellX: number,
  cellY: number,
  sizeW: number,
  sizeH: number,
  gridCols: number,
  gridRows: number,
): { x: number; y: number } {
  // Buildings occupy the rear of the defender zone (past the garrison strip).
  const z = BATTLE_FIELD.defenderZone;
  const buildX0 = Math.max(z.x0, BATTLE_FIELD.garrisonZone.x1 + 0.15);
  const build = { x0: buildX0, x1: z.x1, y0: z.y0, y1: z.y1 };
  const zw = build.x1 - build.x0;
  const zh = build.y1 - build.y0;
  const cx = (cellX + sizeW / 2) / gridCols;
  const cy = (cellY + sizeH / 2) / gridRows;
  return clampToZone(build.x0 + cx * zw, build.y0 + cy * zh, build);
}

/** True if a point lies on the playable ground plane. */
export function isOnGround(x: number, y: number): boolean {
  const b = fieldBounds();
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}
