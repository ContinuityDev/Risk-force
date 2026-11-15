import { useState } from "react";
import { factionColor } from "../data/factions";
import { GAME_LOOP, HELP } from "../data/gameLoop";
import type { GameAction } from "../engine/actions";
import { computeEnergyLedger } from "../engine/economy";
import type { GameState, PlayerState, Screen } from "../engine/state";
import { useLongPress } from "../hooks/useLongPress";

interface HudProps {
  state: GameState;
  activePlayer: PlayerState;
  isHumanTurn: boolean;
  dispatch: (action: GameAction) => void;
}

const NAV: { screen: Screen; label: string }[] = [
  { screen: "map", label: "Map" },
  { screen: "base", label: "Base" },
  { screen: "research", label: "Research" },
  { screen: "invade", label: "Invade" },
  { screen: "save", label: "Save" },
];

export function Hud({ state, activePlayer, isHumanTurn, dispatch }: HudProps) {
  const r = activePlayer.resources;
  const color = factionColor(activePlayer.id);
  const [helpOpen, setHelpOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [ledgerHeld, setLedgerHeld] = useState(false);
  const ledger = computeEnergyLedger(state, activePlayer.id);
  const netSign = ledger.net >= 0 ? "+" : "−";
  const netAbs = Math.abs(ledger.net);
  const energyTitle = [
    `Income +${ledger.income}/t`,
    `Upkeep −${ledger.upkeep}/t`,
    `Campaign −${ledger.campaign}/t`,
    `Net ${ledger.net >= 0 ? "+" : ""}${ledger.net}/t`,
    HELP.upkeep,
  ].join(" · ");
  const longPress = useLongPress(
    () => setLedgerHeld(true),
    () => setLedgerHeld(false),
  );

  return (
    <header className="rf-hud">
      <div className="rf-hud__identity">
        <span className="rf-label">Turn {state.turn}</span>
        <strong style={{ color }}>{activePlayer.displayName}</strong>
        {!isHumanTurn && <span className="rf-hud__ai">AI executing…</span>}
        {activePlayer.insolvent && (
          <span className="rf-hud__warn" title={HELP.upkeep}>
            Insolvent
          </span>
        )}
      </div>

      <div className="rf-hud__resources" aria-label="Resources">
        <span
          className={`rf-resource rf-tick rf-resource--energy${
            ledgerHeld ? " is-held" : ""
          }`}
          title={energyTitle}
          {...longPress}
        >
          <span className="rf-label">Energy</span>
          <strong>{Math.floor(r.energy)}</strong>
          <small
            className={`rf-hud__upkeep${ledger.net >= 0 ? " is-pos" : " is-neg"}`}
          >
            {netSign}
            {netAbs}/t
          </small>
          <span className="rf-hud__ledger" role="tooltip">
            <span>+{ledger.income} income</span>
            <span>−{ledger.upkeep} upkeep</span>
            <span>−{ledger.campaign} campaign</span>
            <span className={ledger.net >= 0 ? "is-pos" : "is-neg"}>
              = {ledger.net >= 0 ? "+" : ""}
              {ledger.net} net
            </span>
          </span>
        </span>
        <span className="rf-resource rf-tick">
          <span className="rf-label">Alloy</span>
          <strong>{Math.floor(r.alloy)}</strong>
        </span>
        <span className="rf-resource rf-tick">
          <span className="rf-label">Research</span>
          <strong>{Math.floor(r.research)}</strong>
        </span>
        <span className="rf-resource rf-tick">
          <span className="rf-label">Supply</span>
          <strong>{Math.floor(r.supply)}</strong>
        </span>
        <label
          className="rf-resource rf-hud__campaign"
          title={HELP.campaigning}
        >
          <span className="rf-label">Campaign</span>
          <input
            type="range"
            min={0}
            max={GAME_LOOP.campaigning.maxBudget}
            step={5}
            value={activePlayer.campaignBudget}
            disabled={!isHumanTurn}
            onChange={(e) =>
              dispatch({
                type: "SET_CAMPAIGN_BUDGET",
                payload: { energy: Number(e.target.value) },
              })
            }
          />
          <strong>{activePlayer.campaignBudget}</strong>
        </label>
      </div>

      <nav className={`rf-hud__nav${navOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="ghost rf-hud__nav-toggle"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          Menu
        </button>
        <div className="rf-hud__nav-items">
          {NAV.map(({ screen, label }) => (
            <button
              key={screen}
              type="button"
              className={state.screen === screen ? "primary" : "ghost"}
              disabled={!isHumanTurn && screen !== "map" && screen !== "save"}
              onClick={() => {
                setNavOpen(false);
                dispatch({ type: "SET_SCREEN", payload: { screen } });
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="ghost"
            onClick={() => setHelpOpen((v) => !v)}
            title="Game loop help"
          >
            Help
          </button>
          <button
            type="button"
            className="primary"
            disabled={!isHumanTurn || state.phase !== "play"}
            onClick={() => dispatch({ type: "END_TURN" })}
          >
            End Turn
          </button>
        </div>
      </nav>

      {helpOpen && (
        <div className="rf-hud__help" role="dialog" aria-label="Game loop help">
          <strong>How the theater works</strong>
          <p>{HELP.campaigning}</p>
          <p>{HELP.population}</p>
          <p>{HELP.training}</p>
          <p>{HELP.workers}</p>
          <p>{HELP.invasion}</p>
          <p>{HELP.upkeep}</p>
          <p>{HELP.movement}</p>
          <p>{HELP.continents}</p>
          <p>{HELP.victory}</p>
          <p>{HELP.ai}</p>
          <button
            type="button"
            className="ghost"
            onClick={() => setHelpOpen(false)}
          >
            Close
          </button>
        </div>
      )}

      {state.turnLog.length > 0 && (
        <div className="rf-hud__turnlog" role="status">
          <span className="rf-label">Turn log</span>
          <ul>
            {state.turnLog.slice(-8).map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
          <button
            type="button"
            className="ghost"
            onClick={() => dispatch({ type: "DISMISS_TURN_LOG" })}
          >
            Clear
          </button>
        </div>
      )}

      {state.message && (
        <div className="rf-hud__message" role="status">
          <span>{state.message}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => dispatch({ type: "DISMISS_MESSAGE" })}
          >
            Dismiss
          </button>
        </div>
      )}
    </header>
  );
}
