import { RESEARCH_LIST } from "../research";
import type { BuildingDef } from "../types";
import { GAME_LOOP } from "../gameLoop";

function workerSlots(def: BuildingDef): number {
  if (def.category === "economy") return GAME_LOOP.workers.economyCap;
  if (def.category === "defense") return GAME_LOOP.workers.defenseCap;
  if (def.category === "command") return GAME_LOOP.workers.commandCap;
  return GAME_LOOP.workers.defaultCap;
}

/** Rich, data-driven blurb for build menus, tooltips, and staffing. */
export function buildingBlurb(def: BuildingDef): string {
  const parts: string[] = [def.description.trim()];

  const out = def.output
    ? Object.entries(def.output)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `+${v} ${k}/t`)
        .join(", ")
    : "";
  if (out) parts.push(`Output ${out} (scales with staff).`);

  if (def.damage) {
    parts.push(
      `Combat: ${def.damage} ${def.damageType ?? "dmg"} · range ${def.range ?? "—"} · rate ${def.fireRate ?? "—"}/s.`,
    );
  }

  const costBits = [`E${def.cost.energy}`];
  if (def.cost.alloy) costBits.push(`A${def.cost.alloy}`);
  if (def.cost.research) costBits.push(`R${def.cost.research}`);
  parts.push(
    `Cost ${costBits.join(" · ")} · build ${def.buildTime} turn${def.buildTime === 1 ? "" : "s"}.`,
  );

  if (def.supplyUpkeep) {
    parts.push(`Upkeep −${def.supplyUpkeep} supply/t while online.`);
  }

  const slots = workerSlots(def);
  if (slots > 0 && (def.output || def.category === "command")) {
    parts.push(`Worker slots ${slots} — assign staff to raise output.`);
  }

  if (def.requiresResearch) {
    const node = RESEARCH_LIST.find((n) => n.id === def.requiresResearch);
    parts.push(
      `Requires research: ${node?.name ?? def.requiresResearch.replace(/_/g, " ")}.`,
    );
  }

  return parts.join(" ");
}

/** Short one-liner for cramped mobile chrome. */
export function buildingBlurbShort(def: BuildingDef): string {
  const out = def.output
    ? Object.entries(def.output)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `+${v}${k[0]!.toUpperCase()}`)
        .join(" ")
    : def.damage
      ? `${def.damage} dmg`
      : def.category;
  return `${def.description} · ${out}`;
}
