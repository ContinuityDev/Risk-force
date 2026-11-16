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
            <div className="rf-market__rates">
              <span>
                Sell {q.from}: <em>{q.sellRate.toFixed(2)}</em> {q.to}/ea
              </span>
              <span>
                Buy {q.to}: <em>{q.buyRate.toFixed(2)}</em> {q.from}/ea
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="rf-market__trade">
        <label className="rf-field">
          <span className="rf-label">Spend</span>
          <select
            className="rf-control"
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
            className="rf-control"
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
            className="rf-control"
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
      {from !== to && (
        <p className="rf-market__preview" role="status">
          Preview: spend {amount} {from} → receive{" "}
          {(() => {
            const q = quotes.find(
              (x) =>
                (x.from === from && x.to === to) ||
                (x.from === to && x.to === from),
            );
            if (!q) return "?";
            if (q.from === from && q.to === to) {
              return (amount * q.sellRate).toFixed(1);
            }
            return (amount / q.buyRate).toFixed(1);
          })()}{" "}
          {to}
        </p>
      )}
    </div>
  );
}
