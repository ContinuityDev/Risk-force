/** Cap backing-store density for any canvas work on mid-range phones. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

export function cappedDevicePixelRatio(
  cap = MAX_DEVICE_PIXEL_RATIO,
): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, cap);
}
