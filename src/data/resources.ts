import type { ResourceId } from "./types";
import { HELP } from "./gameLoop";

export interface ResourceMeta {
  id: ResourceId | "campaign";
  label: string;
  short: string;
  tip: string;
}

export const RESOURCE_META: Record<ResourceId | "campaign", ResourceMeta> = {
  energy: {
    id: "energy",
    label: "Energy",
    short: "NRG",
    tip: `Primary power currency. Comes from reactors and continent bonuses. Spent on builds, training, research upkeep, and campaigning. ${HELP.upkeep}`,
  },
  alloy: {
    id: "alloy",
    label: "Alloy",
    short: "ALY",
    tip: "Structural metal from refineries and foundries. Spent on advanced buildings, armor, and high-tier units.",
  },
  research: {
    id: "research",
    label: "Research",
    short: "RSH",
    tip: "Lab signal from nexus, labs, and research buildings. Spent unlocking tech nodes that open units and structures.",
  },
  supply: {
    id: "supply",
    label: "Supply",
    short: "SUP",
    tip: "Logistics stock from depots and factories. Spent launching invasions and maintaining some heavy structures.",
  },
  campaign: {
    id: "campaign",
    label: "Campaign",
    short: "CMP",
    tip: HELP.campaigning,
  },
};
