/**
 * Map world-space facing to a discrete direction frame index.
 *
 * Convention: angle 0 = +X (east / screen-right), increasing clockwise
 * in screen space where +Y is down (battle arena). Frame 0 is the
 * default bake pose (barrel / nose toward +X).
 */

export const DEFAULT_DIRECTIONS = 8;

/** Normalize radians to (-π, π]. */
export function wrapAngle(rad: number): number {
  let a = rad;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** Shortest signed delta from `from` to `to` in radians. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/**
 * World delta → facing angle (radians).
 * +X right, +Y down (matches battle layout).
 */
export function facingFromDelta(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

/**
 * Angle (radians) → direction frame index in [0, directions).
 * Frames are equally spaced; 0 faces +X.
 */
export function angleToDirFrame(
  angleRad: number,
  directions: number = DEFAULT_DIRECTIONS,
): number {
  const n = Math.max(1, Math.floor(directions));
  if (n === 1) return 0;
  const step = (Math.PI * 2) / n;
  // Round to nearest sector; offset by half-step so boundaries sit mid-sector
  const idx = Math.round(wrapAngle(angleRad) / step);
  return ((idx % n) + n) % n;
}

/**
 * Delta → direction frame. Convenience for movement / aim vectors.
 */
export function deltaToDirFrame(
  dx: number,
  dy: number,
  directions: number = DEFAULT_DIRECTIONS,
): number {
  return angleToDirFrame(facingFromDelta(dx, dy), directions);
}

/**
 * Smoothly turn `facing` toward `desired` by at most `turnRate * dt` rad.
 */
export function stepFacing(
  facing: number,
  desired: number,
  dt: number,
  turnRate = 5.5,
): number {
  const d = angleDelta(facing, desired);
  const maxStep = turnRate * dt;
  if (Math.abs(d) <= maxStep) return wrapAngle(desired);
  return wrapAngle(facing + Math.sign(d) * maxStep);
}
