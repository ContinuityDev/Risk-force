import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BATTLE_FIELD } from "../data/battleField";
import { getBuilding } from "../data/buildings";
import { factionName } from "../data/factions";
import { getTerritory } from "../data/map/territories";
import { getUnit } from "../data/units";
import type { GameAction } from "../engine/actions";
import type { BattleState, GameState } from "../engine/state";
import { angleToDirFrame } from "../sprites/facing";
import {
  getDirectionCount,
  getSpriteUrl,
} from "../sprites/registry";
import { DirSprite } from "./DirSprite";
import { Sprite } from "./Sprite";

interface DmgFloater {
  id: string;
  x: number;
  y: number;
  text: string;
  side: "atk" | "def";
}

/** Muzzle flash offset as % of actor box, keyed by 8-dir frame (barrel tip). */
const MUZZLE_8: Array<{ left: string; top: string }> = [
  { left: "92%", top: "46%" }, // E
  { left: "82%", top: "78%" }, // SE
  { left: "50%", top: "92%" }, // S
  { left: "18%", top: "78%" }, // SW
  { left: "8%", top: "46%" }, // W
  { left: "18%", top: "16%" }, // NW
  { left: "50%", top: "8%" }, // N
  { left: "82%", top: "16%" }, // NE
];

function muzzleStyle(facing: number, spriteId: string): CSSProperties {
  const n = getDirectionCount(spriteId);
  const mapped = angleToDirFrame(facing, 8);
  const pos = MUZZLE_8[n === 8 ? angleToDirFrame(facing, n) : mapped] ?? MUZZLE_8[0]!;
  const deg = (facing * 180) / Math.PI;
  return {
    left: pos.left,
    top: pos.top,
    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
  };
}

interface BattleViewProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const FIELD_W = BATTLE_FIELD.width;
const FIELD_H = BATTLE_FIELD.height;

function worldToPct(x: number, y: number) {
  return {
    left: `${(x / FIELD_W) * 100}%`,
    top: `${(y / FIELD_H) * 100}%`,
  };
}

function zoneStyle(z: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}): CSSProperties {
  return {
    left: `${(z.x0 / FIELD_W) * 100}%`,
    top: `${(z.y0 / FIELD_H) * 100}%`,
    width: `${((z.x1 - z.x0) / FIELD_W) * 100}%`,
    height: `${((z.y1 - z.y0) / FIELD_H) * 100}%`,
  };
}

function ProjectileLayer({ p }: { p: BattleState["projectiles"][number] }) {
  const sx = ((p.sx ?? p.x) / FIELD_W) * 100;
  const sy = ((p.sy ?? p.y) / FIELD_H) * 100;
  const tipX = (p.x / FIELD_W) * 100;
  const tipY = (p.y / FIELD_H) * 100;
  const dx = tipX - sx;
  const dy = tipY - sy;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const style = p.style;
  const isBeam = style === "laser" || style === "rail" || style === "orbital";

  return (
    <>
      <div
        className={`rf-battle__tracer rf-battle__tracer--${style}${
          isBeam ? " is-beam" : ""
        }`}
        style={{
          left: `${sx}%`,
          top: `${sy}%`,
          width: `${Math.max(len, 1.2)}%`,
          transform: `rotate(${ang}deg)`,
        }}
      />
      <div
        className={`rf-battle__bolt rf-battle__bolt--${style}`}
        style={{ left: `${tipX}%`, top: `${tipY}%` }}
      />
    </>
  );
}

export function BattleView({ state, dispatch }: BattleViewProps) {
  const battle = state.battle;
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [floaters, setFloaters] = useState<DmgFloater[]>([]);
  const prevHp = useRef<Record<string, number>>({});

  const title = useMemo(() => {
    if (!battle) return "Battle";
    try {
      return getTerritory(battle.territoryId).name;
    } catch {
      return battle.territoryId;
    }
  }, [battle]);

  // Spawn floating damage numbers when HP drops (both sides).
  useEffect(() => {
    if (!battle) return;
    const next: DmgFloater[] = [];
    for (const u of battle.units) {
      const prev = prevHp.current[u.id];
      if (prev !== undefined && u.hp < prev) {
        next.push({
          id: `f-${u.id}-${battle.time}-${prev}`,
          x: u.x,
          y: u.y,
          text: `−${Math.max(1, Math.round(prev - u.hp))}`,
          side: u.side === "attacker" ? "atk" : "def",
        });
      }
      prevHp.current[u.id] = u.hp;
    }
    for (const d of battle.defenses) {
      const prev = prevHp.current[d.id];
      if (prev !== undefined && d.hp < prev) {
        next.push({
          id: `f-${d.id}-${battle.time}-${prev}`,
          x: d.x,
          y: d.y,
          text: `−${Math.max(1, Math.round(prev - d.hp))}`,
          side: "def",
        });
      }
      prevHp.current[d.id] = d.hp;
    }
    if (next.length) {
      setFloaters((cur) => [...cur, ...next].slice(-28));
    }
  }, [battle]);

  useEffect(() => {
    if (!floaters.length) return;
    const t = window.setTimeout(() => {
      setFloaters((cur) => cur.slice(Math.max(0, cur.length - 12)));
    }, 900);
    return () => window.clearTimeout(t);
  }, [floaters]);

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
      {tooltip && (
        <div
          className="rf-touch-tooltip"
          role="tooltip"
          onClick={() => setTooltip(null)}
        >
          {tooltip}
        </div>
      )}
      <header className="rf-view-header rf-battle__header">
        <div className="rf-battle__title">
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
            <>
              <button
                type="button"
                className="rf-battle__retreat"
                onClick={() => dispatch({ type: "RETREAT_BATTLE" })}
              >
                Retreat
              </button>
              <button
                type="button"
                className="rf-battle__skip"
                onClick={() => {
                  for (let i = 0; i < 240; i++) {
                    dispatch({ type: "BATTLE_TICK", payload: { dt: 0.25 } });
                  }
                  dispatch({ type: "RESOLVE_BATTLE" });
                }}
              >
                Skip Battle
              </button>
            </>
          )}
        </div>
      </header>
      {/* Slim mobile overlay bar (visible only on short landscape via CSS) */}
      <div className="rf-battle__slimbar" aria-hidden={false}>
        <span className="rf-battle__slimbar-title">
          <strong>{title}</strong>
          <small className="rf-text-dim">
            {factionName(battle.attacker)} vs {factionName(battle.defender)}
          </small>
        </span>
        {done ? (
          <button
            type="button"
            className="primary rf-battle__skip"
            onClick={() => dispatch({ type: "RESOLVE_BATTLE" })}
          >
            Resolve
          </button>
        ) : (
          <>
            <button
              type="button"
              className="rf-battle__retreat"
              onClick={() => dispatch({ type: "RETREAT_BATTLE" })}
            >
              Retreat
            </button>
            <button
              type="button"
              className="rf-battle__skip"
              onClick={() => {
                for (let i = 0; i < 240; i++) {
                  dispatch({ type: "BATTLE_TICK", payload: { dt: 0.25 } });
                }
                dispatch({ type: "RESOLVE_BATTLE" });
              }}
            >
              Skip
            </button>
          </>
        )}
      </div>

      <div className="rf-battle__stage">
        <div className="rf-battle__viewport">
          {/* Decorative sky sits ABOVE the playable ground — never under units. */}
          <div className="rf-battle__skyband" aria-hidden />
          <div
            className="rf-battle__arena"
            style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}
          >
          <div className="rf-battle__ground" />
          <div className="rf-battle__tracks" />
          <div className="rf-battle__scorch" />
          <div className="rf-battle__rubble" />
          <div
            className="rf-battle__zone rf-battle__zone--deploy"
            style={zoneStyle(BATTLE_FIELD.attackerDeploy)}
            title="Attacker deployment"
          />
          <div
            className="rf-battle__zone rf-battle__zone--nml"
            style={zoneStyle(BATTLE_FIELD.noMansLand)}
            title="No-man's-land"
          />
          <div
            className="rf-battle__zone rf-battle__zone--base"
            style={zoneStyle(BATTLE_FIELD.defenderZone)}
            title="Defender base"
          />
          <div className="rf-battle__smoke rf-battle__smoke--a" />
          <div className="rf-battle__smoke rf-battle__smoke--b" />

          {battle.scorches.map((sc) => {
            const pos = worldToPct(sc.x, sc.y);
            const fade = Math.max(0, 1 - sc.t / 14);
            const px = 72 * sc.scale;
            return (
              <div
                key={sc.id}
                className="rf-battle__scorch-decal"
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: px,
                  height: px * 0.55,
                  opacity: 0.55 * fade,
                }}
              />
            );
          })}

          {battle.defenses.map((d) => {
            if (!d.alive && d.anim !== "destroyed") return null;
            const wreck = !d.alive;
            if (wreck && d.animT > 2.8) return null;
            const pos = worldToPct(d.x, d.y);
            let spriteId = "building-shield";
            let size = 96;
            try {
              const def = getBuilding(d.buildingId);
              spriteId = def.sprite.id;
              size = def.size.w >= 2 ? 112 : 96;
            } catch {
              /* */
            }
            const tip = `${d.buildingId} · HP ${Math.ceil(d.hp)}/${d.maxHp}`;
            return (
              <div
                key={d.id}
                className={`rf-battle__actor rf-battle__actor--def ${
                  d.anim === "firing"
                    ? "is-firing"
                    : wreck
                      ? "is-wreck is-burning"
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
                title={tip}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") return;
                  const t = window.setTimeout(() => setTooltip(tip), 480);
                  const clear = () => {
                    window.clearTimeout(t);
                    window.removeEventListener("pointerup", clear);
                    window.removeEventListener("pointercancel", clear);
                  };
                  window.addEventListener("pointerup", clear, { once: true });
                  window.addEventListener("pointercancel", clear, {
                    once: true,
                  });
                }}
              >
                {(d.buildingId.includes("shield") ||
                  d.buildingId === "shield_wall") &&
                  d.alive && <span className="rf-battle__shield-bubble" />}
                {wreck ? (
                  <>
                    <img
                      src={getSpriteUrl("fx-wreck")}
                      alt=""
                      draggable={false}
                    />
                    <span className="rf-battle__burn" aria-hidden />
                  </>
                ) : (
                  <DirSprite id={spriteId} facing={d.facing} size={size} />
                )}
                {d.anim === "firing" && d.alive && (
                  <span
                    className="rf-battle__muzzle"
                    style={muzzleStyle(d.facing, spriteId)}
                    aria-hidden
                  />
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
            // Smaller sprites so the arena fits without clipping the bottom edge.
            let size = 72;
            try {
              const def = getUnit(u.unitId);
              spriteId = def.sprite.id;
              const isMech = /mech|walker|spider/i.test(u.unitId);
              size =
                def.role === "armor" || def.role === "naval"
                  ? 84
                  : isMech
                    ? 88
                    : def.role === "air" || def.role === "orbital"
                      ? 76
                      : def.role === "artillery"
                        ? 80
                        : 70;
            } catch {
              /* */
            }
            const wreck = !u.alive;
            // Hide long-lived grey ghosts — keep burnt wrecks briefly then drop.
            if (wreck && u.animT > 2.4) return null;
            let unitName = u.unitId;
            try {
              unitName = getUnit(u.unitId).name;
            } catch {
              /* */
            }
            const tip = `${unitName} (${u.side}) · HP ${Math.ceil(u.hp)}/${u.maxHp}`;
            return (
              <div
                key={u.id}
                className={`rf-battle__actor rf-battle__actor--unit ${
                  u.anim === "attack"
                    ? "is-firing"
                    : u.anim === "hit"
                      ? "is-hit"
                      : u.anim === "move"
                        ? "is-moving"
                        : wreck
                          ? "is-wreck"
                          : u.disabledT > 0
                            ? "is-disabled"
                            : "is-idle"
                }`}
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: size,
                  height: size,
                }}
                title={tip}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") return;
                  const t = window.setTimeout(() => setTooltip(tip), 480);
                  const clear = () => {
                    window.clearTimeout(t);
                    window.removeEventListener("pointerup", clear);
                    window.removeEventListener("pointercancel", clear);
                  };
                  window.addEventListener("pointerup", clear, { once: true });
                  window.addEventListener("pointercancel", clear, {
                    once: true,
                  });
                }}
              >
                {wreck ? (
                  <>
                    <img
                      src={getSpriteUrl("fx-wreck")}
                      alt=""
                      draggable={false}
                    />
                    <span className="rf-battle__spark" aria-hidden />
                  </>
                ) : (
                  <DirSprite id={spriteId} facing={u.facing} size={size} />
                )}
                {u.anim === "attack" && u.alive && (
                  <span
                    className="rf-battle__muzzle"
                    style={muzzleStyle(u.facing, spriteId)}
                    aria-hidden
                  />
                )}
                {u.anim === "hit" && u.alive && (
                  <span className="rf-battle__spark rf-battle__spark--hit" aria-hidden />
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

          {floaters.map((f) => {
            const pos = worldToPct(f.x, f.y);
            return (
              <span
                key={f.id}
                className={`rf-battle__dmg rf-battle__dmg--${f.side}`}
                style={{ left: pos.left, top: pos.top }}
              >
                {f.text}
              </span>
            );
          })}

          {battle.explosions.map((ex) => {
            const pos = worldToPct(ex.x, ex.y);
            const life = Math.min(1, ex.t / 0.55);
            const isStructure = ex.style === "structure";
            const isEmp = ex.style === "emp";
            const size = isEmp ? 22 : isStructure ? 36 : 14;
            return (
              <div
                key={ex.id}
                className={`rf-battle__blast rf-battle__blast--${ex.style}`}
                style={{ left: pos.left, top: pos.top }}
              >
                <span
                  className="rf-battle__impact"
                  style={{
                    width: size,
                    height: size,
                    opacity: Math.max(0, 1 - life),
                    transform: `scale(${0.55 + life * 0.9})`,
                  }}
                />
                {(isStructure || isEmp) && (
                  <img
                    className="rf-battle__explosion rf-battle__explosion--core"
                    src={getSpriteUrl(isEmp ? "fx-emp" : "fx-explosion")}
                    alt=""
                    style={{
                      width: size * 1.15,
                      height: size * 1.15,
                      opacity: Math.max(0, 0.85 - life * 1.1),
                      transform: `scale(${0.7 + life * 0.45})`,
                    }}
                  />
                )}
                {isStructure && (
                  <img
                    className="rf-battle__explosion-smoke"
                    src={getSpriteUrl("fx-smoke")}
                    alt=""
                    style={{
                      width: 40,
                      height: 40,
                      transform: `translate(0, ${-4 - life * 22}px) scale(${0.8 + life})`,
                      opacity: Math.max(0, 0.55 - life * 0.7),
                    }}
                  />
                )}
              </div>
            );
          })}
          </div>
        </div>

        <button
          type="button"
          className="ghost rf-battle__log-toggle"
          aria-expanded={logOpen}
          onClick={() => setLogOpen((v) => !v)}
        >
          {logOpen ? "Hide log" : "Combat log"}
        </button>
        <aside className={`rf-battle__log${logOpen ? " is-open" : ""}`}>
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
