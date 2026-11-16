/**
 * Conflict-of-Nations-style grounded map chrome geometry.
 * No circular badges/discs — sprites sit on elliptical contact shadows
 * with soft foot contact (no separate faction stripe).
 */

export interface GroundedFootprint {
  /** Elliptical contact shadow under the visible feet/base. */
  shadow: { cx: number; cy: number; rx: number; ry: number };
  /**
   * Optional faction tint tucked into the shadow (strokeW 0 = none).
   * Kept for API compatibility; preferred look is shadow-only.
   */
  groundLine: { x1: number; x2: number; y: number; strokeW: number };
  /** Sprite rect — box bottom at y≈0; visible foot above via footInset. */
  sprite: { x: number; y: number; w: number; h: number };
  /** Soft isometric skew degrees (negative = lean right). */
  skewX: number;
  /** Vertical squash for perspective (1 = none). */
  scaleY: number;
  /**
   * Local (pre-scale) distance from sprite box bottom up to the visible foot.
   * Accounts for transparent padding / clipped plinth.
   */
  footInset: number;
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
 * Visible foot Y in parent (unscaled sibling) space.
 * Sprite lives inside `skewX / scaleY`; shadow does not — convert through scaleY.
 * Sprite box bottom is at y=0 in local space; visible foot is `footInset` above that.
 */
export function visibleFootY(fp: GroundedFootprint): number {
  // Local foot at -footInset (above box bottom); after scaleY → still negative.
  return -fp.footInset * fp.scaleY;
}

/** Slight consistent light direction (upper-left → shadow drifts right only). */
const LIGHT_DX = 0.06;

function contactShadowAtFoot(
  footY: number,
  size: number,
  zoomScale: number,
  compact: boolean,
): { cx: number; cy: number; rx: number; ry: number } {
  // Tight ellipse ≈ footprint width; soft & small so it reads as contact.
  const rx = size * (compact ? 0.28 : 0.32);
  const ry = Math.max(0.11 * zoomScale, size * 0.05);
  // Keep most of the ellipse under the foot; top overlaps the sprite base.
  // No downward light bias — that read as a floating gap under the piece.
  const cy = footY + ry * 0.15;
  const cx = size * LIGHT_DX;
  return { cx, cy, rx, ry };
}

function emptyLine(): GroundedFootprint["groundLine"] {
  return { x1: 0, x2: 0, y: 0, strokeW: 0 };
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
  const scaleY = 0.9;
  const spriteH = s * (compact ? 0.95 : 1.08);
  const spriteW = s * (compact ? 0.72 : 0.78);
  // Square unit art in a taller box uses meet → rendered height ≈ spriteW.
  // Foot pad is a fraction of that rendered height, not the empty box.
  const renderedH = Math.min(spriteW, spriteH);
  const footInset = renderedH * (compact ? 0.1 : 0.12);
  // Box bottom at y=0 so the shadow sibling aligns with the feet.
  const spriteY = -spriteH;
  const footY = -footInset * scaleY;
  const shadow = contactShadowAtFoot(footY, s, zoomScale, compact);
  const hasCount = (opts.count ?? 0) > 0;
  const tagH = Math.max(1.1 * zoomScale, s * (compact ? 0.28 : 0.22));
  const tagFont = Math.max(1.4 * zoomScale, tagH * 0.72);
  const tagW = Math.max(tagH * 1.15, tagFont * (compact ? 1.6 : 1.4));
  return {
    shadow,
    groundLine: emptyLine(),
    sprite: {
      x: -spriteW / 2,
      y: spriteY,
      w: spriteW,
      h: spriteH,
    },
    skewX: compact ? -4 : -7,
    scaleY,
    footInset,
    countTag: hasCount
      ? {
          x: spriteW * 0.22,
          y: shadow.cy - tagH * 0.05,
          w: tagW,
          h: tagH,
          font: tagFont,
        }
      : null,
    progressBar: null,
    hit: {
      x: -shadow.rx * 1.15,
      y: spriteY * scaleY - s * 0.05,
      w: shadow.rx * 2.3,
      h: -spriteY * scaleY + shadow.ry * 2.4,
    },
  };
}

/**
 * Building footprint — low settlement pad with soft shadow, no square badge.
 * Building sprites clip their baked plinth (~18%); foot is the clip edge.
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
  const scaleY = 0.88;
  const spriteH = s * (compact ? 0.7 : 0.78);
  const spriteW = s * (compact ? 0.88 : 0.95);
  // Clip drops the baked plinth; foot is the clip edge (≈18% of box height).
  // Square art with meet → rendered height ≈ spriteW when box is wider.
  const renderedH = Math.min(spriteW, spriteH);
  const footInset = Math.max(spriteH * 0.18, renderedH * 0.06);
  const spriteY = -spriteH;
  const footY = -footInset * scaleY;
  const shadow = contactShadowAtFoot(footY, s, zoomScale, compact);
  const hasCount = compact && (opts.count ?? 0) > 0;
  const tagH = Math.max(1.0 * zoomScale, s * 0.26);
  const tagFont = Math.max(1.3 * zoomScale, tagH * 0.7);
  const tagW = Math.max(tagH * 1.2, tagFont * 1.55);
  const barH = Math.max(0.35 * zoomScale, s * 0.06);
  return {
    shadow,
    groundLine: emptyLine(),
    sprite: {
      x: -spriteW / 2,
      y: spriteY,
      w: spriteW,
      h: spriteH,
    },
    skewX: compact ? -3 : -5,
    scaleY,
    footInset,
    countTag: hasCount
      ? {
          x: spriteW * 0.28,
          y: shadow.cy - tagH * 0.05,
          w: tagW,
          h: tagH,
          font: tagFont,
        }
      : null,
    progressBar:
      opts.constructing
        ? {
            x: -shadow.rx * 0.7,
            y: shadow.cy + shadow.ry * 0.9,
            w: shadow.rx * 1.4 * Math.max(0.05, Math.min(1, opts.progress ?? 0)),
            h: barH,
          }
        : null,
    hit: {
      x: -shadow.rx * 1.15,
      y: spriteY * scaleY - s * 0.04,
      w: shadow.rx * 2.3,
      h: -spriteY * scaleY + shadow.ry * 2.6,
    },
  };
}

/** True when a footprint intentionally has no circular badge chrome. */
export function isGroundedChrome(fp: GroundedFootprint): boolean {
  return (
    fp.shadow.rx > 0 &&
    fp.shadow.ry > 0 &&
    fp.shadow.ry < fp.shadow.rx &&
    (fp.countTag == null || fp.countTag.w >= fp.countTag.h)
  );
}

/** Shadow overlaps the visible foot (sprite base sits on the ellipse). */
export function shadowHugsFoot(fp: GroundedFootprint): boolean {
  const foot = visibleFootY(fp);
  const top = fp.shadow.cy - fp.shadow.ry;
  const bot = fp.shadow.cy + fp.shadow.ry;
  return foot >= top - 0.05 && foot <= bot + 0.05;
}
