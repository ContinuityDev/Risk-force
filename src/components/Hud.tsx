import { useEffect, useState } from "react";
import { factionColor } from "../data/factions";
import { GAME_LOOP, HELP } from "../data/gameLoop";
import { RESOURCE_META } from "../data/resources";
import type { ResourceId } from "../data/types";
import type { GameAction } from "../engine/actions";
import { computeEnergyLedger } from "../engine/economy";
import type { GameState, PlayerState, Screen } from "../engine/state";
import { useLongPress } from "../hooks/useLongPress";
import { subscribeResourcePulse } from "../ui/resourcePulse";
import { Drawer } from "./Drawer";
import { ResourceIcon } from "./ResourceIcon";

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
  const [tipId, setTipId] = useState<ResourceId | "campaign" | null>(null);
  const [pulse, setPulse] = useState<Partial<Record<ResourceId, boolean>>>({});
  const ledger = computeEnergyLedger(state, activePlayer.id);
  const netSign = ledger.net >= 0 ? "+" : "−";
  const netAbs = Math.abs(ledger.net);

  useEffect(() => {
    return subscribeResourcePulse((ids) => {
      const next: Partial<Record<ResourceId, boolean>> = {};
      for (const id of ids) next[id] = true;
      setPulse(next);
      window.setTimeout(() => setPulse({}), 900);
    });
  }, []);

  useEffect(() => {
    if (!state.message) return;
    const t = window.setTimeout(() => {
      dispatch({ type: "DISMISS_MESSAGE" });
    }, 3200);
    return () => window.clearTimeout(t);
  }, [state.message, dispatch]);

  const energyPress = useLongPress(
    () => setTipId("energy"),
    () => setTipId(null),
  );
  const alloyPress = useLongPress(
    () => setTipId("alloy"),
    () => setTipId(null),
  );
  const researchPress = useLongPress(
    () => setTipId("research"),
    () => setTipId(null),
  );
  const supplyPress = useLongPress(
    () => setTipId("supply"),
    () => setTipId(null),
  );
  const campaignPress = useLongPress(
    () => setTipId("campaign"),
    () => setTipId(null),
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

      <div className="rf-hud__resources" aria-label="Resources" data-tutorial="hud-resources">
        <button
          type="button"
          className={`rf-resource rf-tick rf-resource--energy${
            tipId === "energy" ? " is-held" : ""
          }${pulse.energy ? " is-pulse" : ""}`}
          data-tutorial="hud-energy"
          aria-label={`Energy ${Math.floor(r.energy)}, ${netSign}${netAbs} per turn`}
          {...energyPress}
          onClick={() =>
            setTipId((cur) => (cur === "energy" ? null : "energy"))
          }
        >
          <ResourceIcon id="energy" />
          <span className="rf-resource__text">
            <span className="rf-label">{RESOURCE_META.energy.short}</span>
            <strong>{Math.floor(r.energy)}</strong>
            <small
              className={`rf-hud__upkeep${ledger.net >= 0 ? " is-pos" : " is-neg"}`}
            >
              {netSign}
              {netAbs}/t
            </small>
          </span>
          {tipId === "energy" && (
            <span className="rf-hud__ledger is-open" role="tooltip">
              <strong>{RESOURCE_META.energy.label}</strong>
              <span>+{ledger.income} income</span>
              <span>−{ledger.upkeep} upkeep</span>
              <span>−{ledger.campaign} campaign</span>
              <span className={ledger.net >= 0 ? "is-pos" : "is-neg"}>
                = {ledger.net >= 0 ? "+" : ""}
                {ledger.net} net
              </span>
              <span className="rf-hud__ledger-tip">{RESOURCE_META.energy.tip}</span>
            </span>
          )}
        </button>

        <button
          type="button"
          className={`rf-resource rf-tick${pulse.alloy ? " is-pulse" : ""}${
            tipId === "alloy" ? " is-held" : ""
          }`}
          aria-label={`Alloy ${Math.floor(r.alloy)}`}
          {...alloyPress}
          onClick={() => setTipId((cur) => (cur === "alloy" ? null : "alloy"))}
        >
          <ResourceIcon id="alloy" />
          <span className="rf-resource__text">
            <span className="rf-label">{RESOURCE_META.alloy.short}</span>
            <strong>{Math.floor(r.alloy)}</strong>
          </span>
          {tipId === "alloy" && (
            <span className="rf-hud__ledger is-open" role="tooltip">
              <strong>{RESOURCE_META.alloy.label}</strong>
              <span className="rf-hud__ledger-tip">{RESOURCE_META.alloy.tip}</span>
            </span>
          )}
        </button>

        <button
          type="button"
          className={`rf-resource rf-tick${pulse.research ? " is-pulse" : ""}${
            tipId === "research" ? " is-held" : ""
          }`}
          aria-label={`Research ${Math.floor(r.research)}`}
          {...researchPress}
          onClick={() =>
            setTipId((cur) => (cur === "research" ? null : "research"))
          }
        >
          <ResourceIcon id="research" />
          <span className="rf-resource__text">
            <span className="rf-label">{RESOURCE_META.research.short}</span>
            <strong>{Math.floor(r.research)}</strong>
          </span>
          {tipId === "research" && (
            <span className="rf-hud__ledger is-open" role="tooltip">
              <strong>{RESOURCE_META.research.label}</strong>
              <span className="rf-hud__ledger-tip">
                {RESOURCE_META.research.tip}
              </span>
            </span>
          )}
        </button>

        <button
          type="button"
          className={`rf-resource rf-tick${pulse.supply ? " is-pulse" : ""}${
            tipId === "supply" ? " is-held" : ""
          }`}
          aria-label={`Supply ${Math.floor(r.supply)}`}
          {...supplyPress}
          onClick={() =>
            setTipId((cur) => (cur === "supply" ? null : "supply"))
          }
        >
          <ResourceIcon id="supply" />
          <span className="rf-resource__text">
            <span className="rf-label">{RESOURCE_META.supply.short}</span>
            <strong>{Math.floor(r.supply)}</strong>
          </span>
          {tipId === "supply" && (
            <span className="rf-hud__ledger is-open" role="tooltip">
              <strong>{RESOURCE_META.supply.label}</strong>
              <span className="rf-hud__ledger-tip">{RESOURCE_META.supply.tip}</span>
            </span>
          )}
        </button>

        <label
          className={`rf-resource rf-hud__campaign${
            tipId === "campaign" ? " is-held" : ""
          }`}
          data-tutorial="hud-campaign"
          {...campaignPress}
        >
          <ResourceIcon id="campaign" />
          <span className="rf-resource__text">
            <span className="rf-label">{RESOURCE_META.campaign.short}</span>
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
              onFocus={() => setTipId("campaign")}
            />
            <strong>{activePlayer.campaignBudget}</strong>
          </span>
          {tipId === "campaign" && (
            <span className="rf-hud__ledger is-open" role="tooltip">
              <strong>{RESOURCE_META.campaign.label}</strong>
              <span className="rf-hud__ledger-tip">
                {RESOURCE_META.campaign.tip}
              </span>
            </span>
          )}
        </label>
      </div>

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
