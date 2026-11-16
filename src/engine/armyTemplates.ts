/**
 * Saved strike compositions — apply in invade / reinforce pickers.
 */

import type { ArmyTemplate, PlayerState, StrikeForceSlot } from "./state";

export function saveArmyTemplate(
  player: PlayerState,
  name: string,
  force: StrikeForceSlot[],
): PlayerState {
  const composition: Record<string, number> = {};
  for (const s of force) {
    if (s.count > 0) composition[s.unitId] = (composition[s.unitId] ?? 0) + s.count;
  }
  if (!Object.keys(composition).length) return player;
  const tpl: ArmyTemplate = {
    id: `tpl-${Date.now().toString(36)}`,
    name: name.trim() || "Template",
    composition,
  };
  const armyTemplates = [...(player.armyTemplates ?? []).slice(-7), tpl];
  return { ...player, armyTemplates };
}

/** Clamp a template to what the garrison actually has. */
export function applyArmyTemplate(
  garrison: Record<string, number>,
  template: ArmyTemplate,
): StrikeForceSlot[] {
  const force: StrikeForceSlot[] = [];
  for (const [unitId, want] of Object.entries(template.composition)) {
    const have = garrison[unitId] ?? 0;
    const take = Math.min(have, Math.max(0, Math.floor(want)));
    if (take > 0) force.push({ unitId, count: take });
  }
  return force;
}

export function deleteArmyTemplate(
  player: PlayerState,
  templateId: string,
): PlayerState {
  return {
    ...player,
    armyTemplates: (player.armyTemplates ?? []).filter((t) => t.id !== templateId),
  };
}
