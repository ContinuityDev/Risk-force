/**
 * Simple resource market — convert energy / alloy / supply at posted rates + spread.
 */

import { GAME_LOOP } from "../data/gameLoop";
import type { ResourceId } from "../data/types";
import type { GameState, PlayerState } from "./state";

export type MarketPair = "energy_alloy" | "energy_supply" | "alloy_supply";

export interface MarketQuote {
  pair: MarketPair;
  /** Pay this resource. */
  from: ResourceId;
  /** Receive this resource. */
  to: ResourceId;
  /** Units of `to` received per 1 `from` when selling `from`. */
  sellRate: number;
  /** Units of `from` paid per 1 `to` when buying `to`. */
  buyRate: number;
}

const cfg = () => GAME_LOOP.logistics;

export function marketQuotes(): MarketQuote[] {
  const m = cfg().midRates;
  const buy = cfg().marketBuySpread;
  const sell = cfg().marketSellSpread;
  return [
    {
      pair: "energy_alloy",
      from: "energy",
      to: "alloy",
      sellRate: (1 / m.energyPerAlloy) * sell,
      buyRate: m.energyPerAlloy * buy,
    },
    {
      pair: "energy_supply",
      from: "energy",
      to: "supply",
      sellRate: (1 / m.energyPerSupply) * sell,
      buyRate: m.energyPerSupply * buy,
    },
    {
      pair: "alloy_supply",
      from: "alloy",
      to: "supply",
      sellRate: (1 / m.alloyPerSupply) * sell,
      buyRate: m.alloyPerSupply * buy,
    },
  ];
}

/**
 * Convert `amount` of `from` into `to` (sell direction of the pair).
 * amount is how much of `from` you spend.
 */
export function marketTrade(
  player: PlayerState,
  from: ResourceId,
  to: ResourceId,
  amount: number,
): PlayerState | null {
  if (amount <= 0 || from === to) return null;
  if (from === "research" || to === "research") return null;
  const have = player.resources[from];
  if (have < amount) return null;

  const quotes = marketQuotes();
  // Find a quote that matches either direction
  let received = 0;
  for (const q of quotes) {
    if (q.from === from && q.to === to) {
      received = amount * q.sellRate;
      break;
    }
    if (q.from === to && q.to === from) {
      // Buying `from` with `to` inverted: spend `amount` of from... wait
      // User spends `from`, wants `to`. Inverse pair: pay buyRate of `to-side`?
      // If quote is energy→alloy sellRate, then alloy→energy uses 1/buyRate of energy_alloy's buy.
      received = amount / q.buyRate;
      break;
    }
  }
  if (received <= 0) return null;
  received = Math.floor(received * 100) / 100;
  if (received < 0.01) return null;

  return {
    ...player,
    resources: {
      ...player.resources,
      [from]: player.resources[from] - amount,
      [to]: player.resources[to] + received,
    },
  };
}

export function applyMarketTrade(
  state: GameState,
  playerId: string,
  from: ResourceId,
  to: ResourceId,
  amount: number,
): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  const next = marketTrade(player, from, to, amount);
  if (!next) return { ...state, message: "Trade failed — check balances." };
  return {
    ...state,
    players: { ...state.players, [playerId]: next },
    message: `Market: −${amount} ${from} → +${(next.resources[to] - player.resources[to]).toFixed(1)} ${to}.`,
  };
}
