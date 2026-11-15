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
    x0: 0.4,
    x1: 3.4,
    y0: 0.45,
    y1: 7.55,
  },

  /** No-man's-land between the lines. */
  noMansLand: {
    x0: 3.4,
    x1: 7.6,
    y0: 0.45,
    y1: 7.55,
  },

  /**
   * Defender base zone (right). Territory base-grid buildings are
   * mapped into this rectangle preserving relative layout.
   */
  defenderZone: {
    x0: 7.6,
    x1: 13.55,
    y0: 0.45,
    y1: 7.55,
  },

  /** Garrison stands just in front of the building zone. */
  garrisonZone: {
    x0: 6.2,
    x1: 7.9,
    y0: 0.55,
    y1: 7.45,
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
  const z = BATTLE_FIELD.defenderZone;
  const zw = z.x1 - z.x0;
  const zh = z.y1 - z.y0;
  const cx = (cellX + sizeW / 2) / gridCols;
  const cy = (cellY + sizeH / 2) / gridRows;
  return clampToZone(z.x0 + cx * zw, z.y0 + cy * zh, z);
}

/** True if a point lies on the playable ground plane. */
export function isOnGround(x: number, y: number): boolean {
  const b = fieldBounds();
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}
