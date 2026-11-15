import type { ArmorType, DamageType } from "./types";

/**
 * Damage vs armor counters (22nd-century near-future doctrine).
 * Values are multipliers applied to raw damage before armorPierce.
 *
 * Quick read:
 * - kinetic   → strong vs light, weak vs fortified/heavy
 * - energy    → strong vs shielded, solid all-rounder
 * - plasma    → strong vs medium, weak vs shielded
 * - explosive → strong vs fortified / light, weak vs aircraft
 * - emp       → devastating vs shielded / aircraft, poor vs soft flesh
 * - missile   → strong vs naval / fortified / heavy
 */
const TABLE: Record<DamageType, Record<ArmorType, number>> = {
  kinetic: {
    light: 1.25,
    medium: 1.0,
    heavy: 0.75,
    fortified: 0.55,
    shielded: 0.85,
    aircraft: 0.7,
    naval: 0.9,
  },
  energy: {
    light: 1.1,
    medium: 1.05,
    heavy: 0.95,
    fortified: 0.8,
    shielded: 1.35,
    aircraft: 1.0,
    naval: 0.95,
  },
  plasma: {
    light: 1.15,
    medium: 1.3,
    heavy: 1.1,
    fortified: 0.9,
    shielded: 0.7,
    aircraft: 0.85,
    naval: 1.0,
  },
  explosive: {
    light: 1.4,
    medium: 1.1,
    heavy: 0.95,
    fortified: 1.35,
    shielded: 0.8,
    aircraft: 0.6,
    naval: 1.15,
  },
  emp: {
    light: 0.4,
    medium: 0.6,
    heavy: 0.7,
    fortified: 0.5,
    shielded: 1.8,
    aircraft: 1.25,
    naval: 1.1,
  },
  missile: {
    light: 1.2,
    medium: 1.15,
    heavy: 1.2,
    fortified: 1.25,
    shielded: 0.75,
    aircraft: 0.9,
    naval: 1.3,
  },
};

export function damageMultiplier(
  damageType: DamageType,
  armorType: ArmorType,
): number {
  return TABLE[damageType]?.[armorType] ?? 1;
}

/** Debug / UI helper — full counter table. */
export function getCombatMatrix(): typeof TABLE {
  return TABLE;
}
