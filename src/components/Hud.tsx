import { useEffect, useState } from "react";
import { factionColor } from "../data/factions";
import { GAME_LOOP, HELP } from "../data/gameLoop";
import type { GameAction } from "../engine/actions";
import { computeEnergyLedger } from "../engine/economy";
import type { GameState, PlayerState, Screen } from "../engine/state";
import { useLongPress } from "../hooks/useLongPress";
import { Drawer } from "./Drawer";

interface HudProps {
  state: GameState;
  activePlayer: PlayerState;
  isHumanTurn: boolean;
  dispatch: (action: GameAction) => void;
  onTutorial?: () => void;
  onOpenNews?: () => void;
}

const NAV: { screen: Screen; label: string }[] = [
  { screen: "map", label: "Map" },
  { screen: "base", label: "Base" },
  { screen: "research", label: "Research" },
  { screen: "invade", label: "Army" },
  { screen: "save", label: "Save" },
];

export function Hud({
  state,
  activePlayer,
  isHumanTurn,
  dispatch,
  onTutorial,
  onOpenNews,
}: HudProps) {
  const r = activePlayer.resources;
  const color = factionColor(activePlayer.id);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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

  useEffect(() => {
    if (!state.message) return;
    const t = window.setTimeout(() => {
      dispatch({ type: "DISMISS_MESSAGE" });
    }, 3200);
    return () => window.clearTimeout(t);
  }, [state.message, dispatch]);

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
          data-tutorial="hud-energy"
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
          data-tutorial="hud-campaign"
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

      {/* News — top-right, thumb-reachable on mobile */}
      {onOpenNews && (
        <button
          type="button"
          className="ghost rf-hud__news"
          data-tutorial="hud-news"
          aria-label={
            state.newsUnread
              ? `News, ${state.newsUnread} unread`
              : "News"
          }
          onClick={onOpenNews}
        >
          News
          {(state.newsUnread ?? 0) > 0 && (
            <span className="rf-hud__news-badge">{state.newsUnread}</span>
          )}
        </button>
      )}

      {/* Desktop nav — hidden on short landscape (MobileDock replaces it) */}
      <nav className="rf-hud__nav rf-hud__nav--desktop">
        {NAV.map(({ screen, label }) => (
          <button
            key={screen}
            type="button"
            className={state.screen === screen ? "primary" : "ghost"}
            disabled={!isHumanTurn && screen !== "map" && screen !== "save"}
            onClick={() =>
              dispatch({ type: "SET_SCREEN", payload: { screen } })
            }
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
        {onTutorial && (
          <button type="button" className="ghost" onClick={onTutorial}>
            Tutorial
          </button>
        )}
        <button
          type="button"
          className="primary"
          disabled={!isHumanTurn || state.phase !== "play"}
          onClick={() => dispatch({ type: "END_TURN" })}
        >
          End Turn
        </button>
      </nav>

      {/* Mobile "More" opens a drawer (Save / Help / Tutorial) */}
      <button
        type="button"
        className="ghost rf-hud__more"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen(true)}
      >
        More
      </button>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} side="right">
        <span className="rf-label">Menu</span>
        <div className="rf-hud__more-list">
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              dispatch({ type: "SET_SCREEN", payload: { screen: "save" } });
            }}
          >
            Save / Load
          </button>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              setHelpOpen(true);
            }}
          >
            Help
          </button>
          {onOpenNews && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onOpenNews();
              }}
            >
              News
              {(state.newsUnread ?? 0) > 0 ? ` (${state.newsUnread})` : ""}
            </button>
          )}
          {onTutorial && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onTutorial();
              }}
            >
              Replay tutorial
            </button>
          )}
        </div>
      </Drawer>

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
        <div className="rf-hud__turnlog" role="status" data-tutorial="turn-log">
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
        <div className="rf-hud__message rf-hud__toast" role="status">
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
