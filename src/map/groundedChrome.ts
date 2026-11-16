/**
 * Conflict-of-Nations-style grounded map chrome geometry.
 * No circular badges/discs — sprites sit on elliptical contact shadows
 * with optional thin faction ground lines and small count tags.
 */

export interface GroundedFootprint {
  /** Elliptical shadow under the feet/base. */
  shadow: { rx: number; ry: number; cy: number };
  /** Short faction-coloured ground tick (not a disc). */
  groundLine: { x1: number; x2: number; y: number; strokeW: number };
  /** Sprite rect — slightly taller than wide, feet near shadow. */
  sprite: { x: number; y: number; w: number; h: number };
  /** Soft isometric skew degrees (negative = lean right). */
  skewX: number;
  /** Vertical squash for perspective (1 = none). */
  scaleY: number;
  /** Count tag (pill, not circle) — null when no count. */
  countTag: {
    x: number;
    y: number;
    w: number;
    h: number;
    font: number;
  } | null;
  /** Construction progress bar under the sprite. */
  progressBar: { x: number; y: number; w: number; h: number } | null;
  /** Transparent hit box. */
  hit: { x: number; y: number; w: number; h: number };
}

/** Mute a faction hex toward the terrain (lower saturation / brightness). */
export function muteFactionColor(hex: string, amount = 0.35): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // Blend toward slate terrain midtone.
  const tr = 72;
  const tg = 82;
  const tb = 92;
  r = Math.round(r + (tr - r) * amount);
  g = Math.round(g + (tg - g) * amount);
  b = Math.round(b + (tb - b) * amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Unit / march footprint — standing silhouette on a contact shadow.
 * `size` is the layout box edge from unitMinis (world units).
 */
export function groundedUnitFootprint(
  size: number,
  zoomScale: number,
  opts: { count?: number; compact?: boolean; transit?: boolean } = {},
): GroundedFootprint {
  const s = Math.max(1.2, size);
  const compact = !!opts.compact;
  // Taller standing figure; feet sit on the shadow.
  const spriteH = s * (compact ? 0.95 : 1.08);
  const spriteW = s * (compact ? 0.72 : 0.78);
  // Flat ellipse — reads as ground contact, not a circular badge.
  const shadowRx = s * (compact ? 0.38 : 0.44);
  const shadowRy = Math.max(0.22 * zoomScale, s * 0.09);
  const groundY = shadowRy * 0.15;
  const spriteY = -spriteH + shadowRy * 0.35;
  const hasCount = (opts.count ?? 0) > 0;
  const tagH = Math.max(1.1 * zoomScale, s * (compact ? 0.28 : 0.22));
  const tagFont = Math.max(1.4 * zoomScale, tagH * 0.72);
  const tagW = Math.max(tagH * 1.15, tagFont * (compact ? 1.6 : 1.4));
  return {
    shadow: { rx: shadowRx, ry: shadowRy, cy: groundY },
    groundLine: {
      x1: -shadowRx * 0.55,
      x2: shadowRx * 0.55,
      y: groundY + shadowRy * 0.15,
      strokeW: Math.max(0.25 * zoomScale, s * 0.045),
    },
    sprite: {
      x: -spriteW / 2,
      y: spriteY,
      w: spriteW,
      h: spriteH,
    },
    skewX: compact ? -4 : -7,
    scaleY: 0.9,
    countTag: hasCount
      ? {
          x: spriteW * 0.22,
          y: groundY - tagH * 0.15,
          w: tagW,
          h: tagH,
          font: tagFont,
        }
      : null,
    progressBar: null,
    hit: {
      x: -shadowRx * 1.05,
      y: spriteY - s * 0.05,
      w: shadowRx * 2.1,
      h: -spriteY + shadowRy * 2,
    },
  };
}

/**
 * Building footprint — low settlement pad with soft shadow, no square badge.
 */
export function groundedBuildingFootprint(
  size: number,
  zoomScale: number,
  opts: {
    count?: number;
    compact?: boolean;
    constructing?: boolean;
    progress?: number;
  } = {},
): GroundedFootprint {
  const s = Math.max(1.2, size);
  const compact = !!opts.compact;
  const spriteH = s * (compact ? 0.7 : 0.78);
  const spriteW = s * (compact ? 0.88 : 0.95);
  const shadowRx = s * (compact ? 0.46 : 0.52);
  const shadowRy = Math.max(0.2 * zoomScale, s * 0.08);
  const groundY = shadowRy * 0.2;
  const spriteY = -spriteH + shadowRy * 0.45;
  const hasCount = compact && (opts.count ?? 0) > 0;
  const tagH = Math.max(1.0 * zoomScale, s * 0.26);
  const tagFont = Math.max(1.3 * zoomScale, tagH * 0.7);
  const tagW = Math.max(tagH * 1.2, tagFont * 1.55);
  const barH = Math.max(0.35 * zoomScale, s * 0.06);
  return {
    shadow: { rx: shadowRx, ry: shadowRy, cy: groundY },
    groundLine: {
      x1: -shadowRx * 0.62,
      x2: shadowRx * 0.62,
      y: groundY + shadowRy * 0.2,
      strokeW: Math.max(0.22 * zoomScale, s * 0.04),
    },
    sprite: {
      x: -spriteW / 2,
      y: spriteY,
      w: spriteW,
      h: spriteH,
    },
    skewX: compact ? -3 : -5,
    scaleY: 0.88,
    countTag: hasCount
      ? {
          x: spriteW * 0.28,
          y: groundY - tagH * 0.1,
          w: tagW,
          h: tagH,
          font: tagFont,
        }
      : null,
    progressBar:
      opts.constructing
        ? {
            x: -shadowRx * 0.7,
            y: groundY + shadowRy * 0.55,
            w: shadowRx * 1.4 * Math.max(0.05, Math.min(1, opts.progress ?? 0)),
            h: barH,
          }
        : null,
    hit: {
      x: -shadowRx * 1.05,
      y: spriteY - s * 0.04,
      w: shadowRx * 2.1,
      h: -spriteY + shadowRy * 2.2,
    },
  };
}

/** True when a footprint intentionally has no circular badge chrome. */
export function isGroundedChrome(fp: GroundedFootprint): boolean {
  return (
    fp.shadow.rx > 0 &&
    fp.shadow.ry > 0 &&
    fp.groundLine.strokeW > 0 &&
    (fp.countTag == null || fp.countTag.w >= fp.countTag.h)
  );
}
