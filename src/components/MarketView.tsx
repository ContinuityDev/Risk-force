import { useState } from "react";
import type { ResourceId } from "../data/types";
import type { GameAction } from "../engine/actions";
import { marketQuotes } from "../engine/market";
import type { GameState, PlayerState } from "../engine/state";

interface MarketViewProps {
  state: GameState;
  activePlayer: PlayerState;
  dispatch: (action: GameAction) => void;
  canAct: boolean;
  onClose?: () => void;
}

export function MarketView({
  activePlayer,
  dispatch,
  canAct,
  onClose,
}: MarketViewProps) {
  const quotes = marketQuotes();
  const [amount, setAmount] = useState(10);
  const [from, setFrom] = useState<ResourceId>("energy");
  const [to, setTo] = useState<ResourceId>("alloy");

  return (
    <div className="rf-market rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Exchange</span>
          <h2>Orbital Market</h2>
          <p className="rf-text-dim">
            Convert energy, alloy, and supply at posted mid-rates with buy/sell
            spread.
          </p>
        </div>
        {onClose && (
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        )}
      </header>

      <ul className="rf-market__quotes">
        {quotes.map((q) => (
          <li key={q.pair}>
            <strong>
              {q.from} ↔ {q.to}
            </strong>
            <small>
              Sell {q.from}: {q.sellRate.toFixed(2)} {q.to}/ea · Buy {q.to}:{" "}
              {q.buyRate.toFixed(2)} {q.from}/ea
            </small>
          </li>
        ))}
      </ul>

      <div className="rf-market__trade">
        <label className="rf-field">
          <span className="rf-label">Spend</span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value as ResourceId)}
          >
            <option value="energy">Energy ({Math.floor(activePlayer.resources.energy)})</option>
            <option value="alloy">Alloy ({Math.floor(activePlayer.resources.alloy)})</option>
            <option value="supply">Supply ({Math.floor(activePlayer.resources.supply)})</option>
          </select>
        </label>
        <label className="rf-field">
          <span className="rf-label">Receive</span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value as ResourceId)}
          >
            <option value="energy">Energy</option>
            <option value="alloy">Alloy</option>
            <option value="supply">Supply</option>
          </select>
        </label>
        <label className="rf-field">
          <span className="rf-label">Amount</span>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={!canAct || from === to}
          onClick={() =>
            dispatch({
              type: "MARKET_TRADE",
              payload: { from, to, amount },
            })
          }
        >
          Trade
        </button>
      </div>
    </div>
  );
}
