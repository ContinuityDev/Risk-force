import { useMemo } from "react";
import { getBuilding } from "../data/buildings";
import { factionName } from "../data/factions";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { GameAction } from "../engine/actions";
import type { BattleState, GameState } from "../engine/state";
import { getSpriteUrl } from "../sprites/registry";
import { Sprite } from "./Sprite";

interface BattleViewProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const FIELD_W = 100;
const FIELD_H = 56;

function worldToPct(x: number, y: number) {
  return {
    left: `${(x / 14) * 100}%`,
    top: `${(y / 7.2) * 100}%`,
  };
}

function ProjectileLayer({ p }: { p: BattleState["projectiles"][number] }) {
  const x0 = (p.x / 14) * 100;
  const y0 = (p.y / 7.2) * 100;
  const x1 = (p.tx / 14) * 100;
  const y1 = (p.ty / 7.2) * 100;
  const cx = x0 + (x1 - x0) * p.progress;
  const cy = y0 + (y1 - y0) * p.progress;
  const style = p.style;

  if (style === "laser" || style === "rail" || style === "orbital") {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <>
        <div
          className={`rf-battle__beam-el rf-battle__beam-el--${style}`}
          style={{
            left: `${x0}%`,
            top: `${y0}%`,
            width: `${len}%`,
            transform: `rotate(${ang}deg)`,
            opacity: Math.max(0.25, 0.9 - p.progress * 0.4),
          }}
        />
        <div
          className={`rf-battle__bolt rf-battle__bolt--${style}`}
          style={{ left: `${cx}%`, top: `${cy}%` }}
        />
      </>
    );
  }

  return (
    <div
      className={`rf-battle__bolt rf-battle__bolt--${style}`}
      style={{ left: `${cx}%`, top: `${cy}%` }}
    />
  );
}

export function BattleView({ state, dispatch }: BattleViewProps) {
  const battle = state.battle;

  const title = useMemo(() => {
    if (!battle) return "Battle";
    try {
      return getTerritory(battle.territoryId).name;
    } catch {
      return battle.territoryId;
    }
  }, [battle]);

  if (!battle) {
    return (
      <div className="rf-empty rf-fade-in">
        <p>No active engagement.</p>
        <button
          type="button"
          className="primary"
          onClick={() =>
            dispatch({ type: "SET_SCREEN", payload: { screen: "map" } })
          }
        >
          Return to Map
        </button>
      </div>
    );
  }

  const done = battle.status !== "running";

  return (
    <div className="rf-battle rf-fade-in">
      <header className="rf-view-header">
        <div>
          <span className="rf-label">Engagement</span>
          <h2>{title}</h2>
          <p className="rf-text-dim">
            {factionName(battle.attacker)} vs {factionName(battle.defender)}
          </p>
        </div>
        <div className="rf-battle__actions">
          {done ? (
            <button
              type="button"
              className="primary"
              onClick={() => dispatch({ type: "RESOLVE_BATTLE" })}
            >
              Resolve & Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                for (let i = 0; i < 240; i++) {
                  dispatch({ type: "BATTLE_TICK", payload: { dt: 0.25 } });
                }
                dispatch({ type: "RESOLVE_BATTLE" });
              }}
            >
              Skip Battle
            </button>
          )}
        </div>
      </header>

      <div className="rf-battle__stage">
        <div
          className="rf-battle__arena"
          style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}
        >
          <div className="rf-battle__sky" />
          <div className="rf-battle__ground" />
          <div className="rf-battle__grid-overlay" />
          <div className="rf-battle__ridge" />

          {battle.defenses.map((d) => {
            if (!d.alive && d.anim !== "destroyed") return null;
            const pos = worldToPct(d.x, d.y);
            let spriteId = "building-shield";
            let size = 112;
            try {
              const def = getBuilding(d.buildingId);
              spriteId = def.sprite.id;
              size = def.size.w >= 2 ? 140 : 116;
            } catch {
              /* */
            }
            const wreck = !d.alive;
            return (
              <div
                key={d.id}
                className={`rf-battle__actor rf-battle__actor--def ${
                  d.anim === "firing"
                    ? "is-firing"
                    : wreck
                      ? "is-wreck"
                      : d.disabledT > 0
                        ? "is-disabled"
                        : ""
                }`}
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: size,
                  height: size,
                }}
              >
                {(d.buildingId.includes("shield") ||
                  d.buildingId === "shield_wall") &&
                  d.alive && <span className="rf-battle__shield-bubble" />}
                <img
                  src={getSpriteUrl(wreck ? "fx-wreck" : spriteId)}
                  alt=""
                  draggable={false}
                />
                {d.anim === "firing" && d.alive && (
                  <span className="rf-battle__muzzle" />
                )}
                {d.alive && (
                  <span className="rf-battle__hpbar">
                    <i style={{ width: `${(d.hp / d.maxHp) * 100}%` }} />
                  </span>
                )}
              </div>
            );
          })}

          {battle.units.map((u) => {
            if (!u.alive && u.anim !== "destroyed") return null;
            const pos = worldToPct(u.x, u.y);
            let spriteId = "unit-trooper";
            let size = 84;
            try {
              const def = getUnit(u.unitId);
              spriteId = def.sprite.id;
              const isMech = /mech|walker|spider/i.test(u.unitId);
              size =
                def.role === "armor" || def.role === "naval"
                  ? 108
                  : isMech
                    ? 118
                    : def.role === "air" || def.role === "orbital"
                      ? 92
                      : def.role === "artillery"
                        ? 100
                        : 86;
            } catch {
              /* */
            }
            const wreck = !u.alive;
            return (
              <div
                key={u.id}
                className={`rf-battle__actor rf-battle__actor--unit ${
                  u.anim === "attack"
                    ? "is-firing"
                    : u.anim === "move"
                      ? "is-moving"
                      : wreck
                        ? "is-wreck"
                        : u.disabledT > 0
                          ? "is-disabled"
                          : ""
                }`}
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: size,
                  height: size,
                }}
              >
                <img
                  src={getSpriteUrl(wreck ? "fx-wreck" : spriteId)}
                  alt=""
                  draggable={false}
                />
                {u.anim === "attack" && u.alive && (
                  <span className="rf-battle__muzzle" />
                )}
                {u.alive && (
                  <span
                    className={`rf-battle__hpbar ${
                      u.side === "attacker" ? "is-atk" : "is-def"
                    }`}
                  >
                    <i style={{ width: `${(u.hp / u.maxHp) * 100}%` }} />
                  </span>
                )}
              </div>
            );
          })}

          {battle.projectiles.map((p) => (
            <ProjectileLayer key={p.id} p={p} />
          ))}

          {battle.explosions.map((ex) => {
            const pos = worldToPct(ex.x, ex.y);
            const scale = 1.25 + ex.t * 2.2;
            const fx = ex.style === "emp" ? "fx-emp" : "fx-explosion";
            return (
              <img
                key={ex.id}
                className="rf-battle__explosion"
                src={getSpriteUrl(fx)}
                alt=""
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: 120,
                  height: 120,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  opacity: Math.max(0, 1 - ex.t * 1.2),
                }}
              />
            );
          })}
        </div>

        <aside className="rf-battle__log">
          <span className="rf-label">Combat log</span>
          <ul>
            {battle.log.length === 0 && (
              <li className="rf-text-dim">Awaiting contact…</li>
            )}
            {battle.log.slice(-14).map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
          <div className="rf-battle__stats">
            <span>
              ATK {battle.units.filter((u) => u.alive).length}/
              {battle.units.length}
            </span>
            <span>
              DEF {battle.defenses.filter((d) => d.alive).length}/
              {battle.defenses.length}
            </span>
          </div>
          {done && (
            <p className="rf-battle__result">
              {battle.status === "attacker_win"
                ? "Attacker victorious"
                : "Defender holds"}
            </p>
          )}
        </aside>
      </div>

      <div className="rf-battle__legend">
        <Sprite id="fx-laser" size={24} anim="none" />
        <Sprite id="fx-plasma" size={20} anim="none" />
        <Sprite id="fx-explosion" size={22} anim="none" />
        <span className="rf-text-dim">
          Live fire · {battle.elapsed.toFixed(1)}s
          {battle.projectiles.length > 0
            ? ` · ${battle.projectiles.length} in flight`
            : ""}
        </span>
      </div>
    </div>
  );
}
