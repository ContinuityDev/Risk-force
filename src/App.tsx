import { useEffect, useRef, useState } from "react";
import type { NewGamePayload } from "./engine/actions";
import { planAiTurn } from "./engine/ai";
import { createMenuState } from "./engine/reducer";
import { useGame } from "./hooks/useGame";
import { createLanTransport } from "./net/lanTransport";
import { createLocalTransport } from "./net/localTransport";
import type { Transport } from "./net/transport";
import { BaseView } from "./components/BaseView";
import { BattleView } from "./components/BattleView";
import { CaptureView } from "./components/CaptureView";
import { Hud } from "./components/Hud";
import { InvadeView } from "./components/InvadeView";
import { LobbyScreen } from "./components/LobbyScreen";
import { MenuScreen } from "./components/MenuScreen";
import { ResearchView } from "./components/ResearchView";
import { SaveScreen } from "./components/SaveScreen";
import { VictoryScreen } from "./components/VictoryScreen";
import { WorldMap } from "./components/WorldMap";

type LobbyMode = "solo" | "hotseat" | "lan";

function menuWithScreen(
  screen: "menu" | "lobby",
): ReturnType<typeof createMenuState> {
  return { ...createMenuState(), screen };
}

export default function App() {
  const [transport, setTransport] = useState<Transport>(() =>
    createLocalTransport(menuWithScreen("menu")),
  );
  const [lobbyMode, setLobbyMode] = useState<LobbyMode | null>(null);
  const [lanStatus, setLanStatus] = useState<string | null>(null);
  const [menuSave, setMenuSave] = useState(false);
  const [campaignActive, setCampaignActive] = useState(false);
  const aiBusy = useRef(false);

  const { state, dispatch, activePlayer, isHumanTurn } = useGame(transport);

  // Playwright / debug harness — map zoom never opens battle/base.
  useEffect(() => {
    const w = window as Window & {
      __RF__?: {
        getState: () => ReturnType<Transport["getState"]>;
        dispatch: Transport["dispatch"];
        neighbors: Record<string, string[]>;
      };
    };
    void import("./data/map/territories").then((mod) => {
      w.__RF__ = {
        getState: () => transport.getState(),
        dispatch: (a) => transport.dispatch(a),
        neighbors: Object.fromEntries(
          mod.TERRITORIES.map((t) => [t.id, t.neighbors]),
        ),
      };
    });
    return () => {
      delete w.__RF__;
    };
  }, [transport, dispatch]);

  function resetToMenu() {
    transport.disconnect?.();
    setLanStatus(null);
    setLobbyMode(null);
    setMenuSave(false);
    setCampaignActive(false);
    aiBusy.current = false;
    setTransport(createLocalTransport(menuWithScreen("menu")));
  }

  function openLobby(mode: LobbyMode) {
    transport.disconnect?.();
    setMenuSave(false);
    setCampaignActive(false);
    setLobbyMode(mode);
    const initial = menuWithScreen("lobby");
    if (mode === "lan") {
      setTransport(createLanTransport(initial));
      setLanStatus(
        "Enter host address and Connect, then Start — or run npm run lan-host.",
      );
    } else {
      setTransport(createLocalTransport(initial));
      setLanStatus(null);
    }
  }

  function startGame(payload: NewGamePayload) {
    setCampaignActive(true);
    setLobbyMode(null);
    setMenuSave(false);
    dispatch({ type: "NEW_GAME", payload });
  }

  async function connectLan(address: string) {
    const t = transport as Transport & {
      connect?: (a: string) => Promise<void>;
    };
    if (!t.connect) {
      setLanStatus("LAN transport unavailable");
      return;
    }
    try {
      setLanStatus("Connecting…");
      await t.connect(address);
      setLanStatus("Connected");
    } catch (e) {
      setLanStatus(e instanceof Error ? e.message : "Connection failed");
    }
  }

  // AI turn loop — dispatch planAiTurn actions with short delays.
  useEffect(() => {
    if (!campaignActive) return;
    if (state.phase !== "play") return;
    if (state.screen === "menu" || state.screen === "lobby") return;
    if (!activePlayer || activePlayer.kind !== "ai") {
      aiBusy.current = false;
      return;
    }
    if (aiBusy.current) return;
    aiBusy.current = true;

    let cancelled = false;
    const actions = planAiTurn(transport.getState());
    let i = 0;

    const step = () => {
      if (cancelled) return;
      const snap = transport.getState();
      if (snap.phase === "battle" || snap.screen === "battle") {
        aiBusy.current = false;
        return;
      }
      const pid = snap.playerOrder[snap.activePlayerIndex];
      const player = pid ? snap.players[pid] : undefined;
      if (!player || player.kind !== "ai") {
        aiBusy.current = false;
        return;
      }
      if (i >= actions.length) {
        aiBusy.current = false;
        return;
      }
      const action = actions[i++]!;
      const label =
        action.type === "START_INVASION"
          ? `${player.displayName} invades ${action.payload.toId}`
          : action.type === "ORDER_MOVE" || action.type === "MOVE_GARRISON"
            ? `${player.displayName} marches troops`
            : action.type === "PLACE_BUILDING"
              ? `${player.displayName} builds`
              : action.type === "RESEARCH"
                ? `${player.displayName} researches`
                : action.type === "SET_AI_ATTACK_PLANS"
                  ? `${player.displayName} opens ${action.payload.plans.length} front(s)`
                  : null;
      if (label) {
        transport.dispatch({
          type: "APPEND_TURN_LOG",
          payload: { lines: [label] },
        });
      }
      transport.dispatch(action);
      if (action.type === "START_INVASION" || action.type === "END_TURN") {
        aiBusy.current = false;
        return;
      }
      window.setTimeout(step, 280);
    };

    const timer = window.setTimeout(step, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    campaignActive,
    state.turn,
    state.activePlayerIndex,
    state.phase,
    state.screen,
    activePlayer?.kind,
    transport,
  ]);

  // Battle ticks via requestAnimationFrame.
  useEffect(() => {
    if (state.screen !== "battle" || state.phase !== "battle") return;
    let raf = 0;
    let last = performance.now();
    let alive = true;

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const snap = transport.getState();
      if (snap.battle?.status === "running") {
        transport.dispatch({ type: "BATTLE_TICK", payload: { dt } });
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [state.screen, state.phase, transport]);

  useEffect(() => {
    if (isHumanTurn) aiBusy.current = false;
  }, [isHumanTurn, state.activePlayerIndex]);

  useEffect(() => {
    if (state.phase === "ended" || state.screen === "victory") {
      setCampaignActive(true);
    }
  }, [state.phase, state.screen]);

  if (menuSave) {
    return (
      <div className="rf-app">
        <div className="rf-shell">
          <button type="button" className="ghost rf-back" onClick={resetToMenu}>
            ← Menu
          </button>
          <SaveScreen
            state={state}
            dispatch={dispatch}
            menuMode
            onLoaded={() => {
              setMenuSave(false);
              setCampaignActive(true);
            }}
          />
        </div>
      </div>
    );
  }

  if (state.screen === "menu" || (!campaignActive && !lobbyMode)) {
    return (
      <div className="rf-app">
        <MenuScreen
          onNewCampaign={() => openLobby("solo")}
          onHotSeat={() => openLobby("hotseat")}
          onLan={() => openLobby("lan")}
          onLoad={() => setMenuSave(true)}
        />
      </div>
    );
  }

  if (lobbyMode && (state.screen === "lobby" || !campaignActive)) {
    return (
      <div className="rf-app">
        <LobbyScreen
          mode={lobbyMode}
          onBack={resetToMenu}
          onStart={startGame}
          onConnect={lobbyMode === "lan" ? connectLan : undefined}
          lanStatus={lanStatus}
        />
      </div>
    );
  }

  if (state.screen === "victory" || state.phase === "ended") {
    const humanId =
      Object.values(state.players).find((p) => p.kind === "human")?.id ?? null;
    return (
      <div className="rf-app">
        <VictoryScreen
          winner={state.winner}
          message={state.message}
          humanId={humanId}
          onMenu={resetToMenu}
        />
      </div>
    );
  }

  if (!activePlayer) {
    return (
      <div className="rf-app">
        <MenuScreen
          onNewCampaign={() => openLobby("solo")}
          onHotSeat={() => openLobby("hotseat")}
          onLan={() => openLobby("lan")}
          onLoad={() => setMenuSave(true)}
        />
      </div>
    );
  }

  return (
    <div className="rf-app">
      <div className="rf-shell">
        <Hud
          state={state}
          activePlayer={activePlayer}
          isHumanTurn={isHumanTurn}
          dispatch={dispatch}
        />
        <main className="rf-main">
          {state.screen === "map" && (
            <WorldMap state={state} dispatch={dispatch} />
          )}
          {state.screen === "base" && (
            <BaseView
              state={state}
              activePlayer={activePlayer}
              dispatch={dispatch}
              canAct={isHumanTurn && state.phase === "play"}
            />
          )}
          {state.screen === "research" && (
            <ResearchView
              activePlayer={activePlayer}
              dispatch={dispatch}
              canAct={isHumanTurn && state.phase === "play"}
            />
          )}
          {state.screen === "invade" && (
            <InvadeView
              state={state}
              activePlayer={activePlayer}
              dispatch={dispatch}
              canAct={isHumanTurn && state.phase === "play"}
            />
          )}
          {state.screen === "battle" && (
            <BattleView state={state} dispatch={dispatch} />
          )}
          {state.screen === "capture" && (
            <CaptureView state={state} dispatch={dispatch} />
          )}
          {state.screen === "save" && (
            <SaveScreen state={state} dispatch={dispatch} />
          )}
        </main>
      </div>
    </div>
  );
}
