import { useMemo, useState, type CSSProperties } from "react";
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

/** Muzzle flash offset as % of actor box, keyed by 8-dir frame. */
const MUZZLE_8: Array<{ left: string; top: string }> = [
  { left: "88%", top: "42%" }, // E
  { left: "78%", top: "72%" }, // SE
  { left: "50%", top: "88%" }, // S
  { left: "22%", top: "72%" }, // SW
  { left: "12%", top: "42%" }, // W
  { left: "22%", top: "18%" }, // NW
  { left: "50%", top: "10%" }, // N
  { left: "78%", top: "18%" }, // NE
];

function muzzleStyle(facing: number, spriteId: string) {
  const n = getDirectionCount(spriteId);
  const frame = angleToDirFrame(facing, n);
  if (n === 8) return MUZZLE_8[frame] ?? MUZZLE_8[0];
  // Approximate for other counts via 8-dir table
  const mapped = angleToDirFrame(facing, 8);
  return MUZZLE_8[mapped] ?? MUZZLE_8[0];
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
  const x0 = (p.x / FIELD_W) * 100;
  const y0 = (p.y / FIELD_H) * 100;
  const x1 = (p.tx / FIELD_W) * 100;
  const y1 = (p.ty / FIELD_H) * 100;
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
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

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
                  <img
                    src={getSpriteUrl("fx-wreck")}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <DirSprite id={spriteId} facing={d.facing} size={size} />
                )}
                {d.anim === "firing" && d.alive && (
                  <span
                    className="rf-battle__muzzle"
                    style={muzzleStyle(d.facing, spriteId)}
                  />
                )}
                {d.alive && d.hp < d.maxHp && (
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
                  <img
                    src={getSpriteUrl("fx-wreck")}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <DirSprite id={spriteId} facing={u.facing} size={size} />
                )}
                {u.anim === "attack" && u.alive && (
                  <span
                    className="rf-battle__muzzle"
                    style={muzzleStyle(u.facing, spriteId)}
                  />
                )}
                {u.alive && u.hp < u.maxHp && (
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
            // ~1.3× tank (~145px), flickery flame + rising smoke
            const life = Math.min(1, ex.t / 0.9);
            const flicker = 0.92 + Math.sin(ex.t * 42 + ex.x * 3) * 0.08;
            const grow = 0.78 + life * 0.35;
            if (ex.style === "emp") {
              return (
                <div
                  key={ex.id}
                  className="rf-battle__blast"
                  style={{ left: pos.left, top: pos.top }}
                >
                  <img
                    className="rf-battle__explosion"
                    src={getSpriteUrl("fx-emp")}
                    alt=""
                    style={{
                      width: 120,
                      height: 120,
                      transform: `scale(${grow})`,
                      opacity: Math.max(0, 1 - life * 1.1),
                    }}
                  />
                </div>
              );
            }
            return (
              <div
                key={ex.id}
                className="rf-battle__blast"
                style={{ left: pos.left, top: pos.top }}
              >
                <span
                  className="rf-battle__flame rf-battle__flame--a"
                  style={{
                    transform: `scale(${grow * flicker}) rotate(${life * 12}deg)`,
                    opacity: Math.max(0, 0.95 - life * 1.05),
                  }}
                />
                <span
                  className="rf-battle__flame rf-battle__flame--b"
                  style={{
                    transform: `scale(${grow * (1.05 - flicker * 0.08)}) rotate(${-life * 18}deg)`,
                    opacity: Math.max(0, 0.85 - life * 1.1),
                  }}
                />
                <img
                  className="rf-battle__explosion rf-battle__explosion--core"
                  src={getSpriteUrl("fx-explosion")}
                  alt=""
                  style={{
                    width: 145,
                    height: 145,
                    transform: `scale(${grow * flicker})`,
                    opacity: Math.max(0, 0.9 - life * 1.2),
                    mixBlendMode: "screen",
                  }}
                />
                <img
                  className="rf-battle__explosion-smoke rf-battle__explosion-smoke--a"
                  src={getSpriteUrl("fx-smoke")}
                  alt=""
                  style={{
                    width: 110,
                    height: 110,
                    transform: `translate(${life * 10}px, ${-6 - life * 48}px) scale(${0.85 + life * 1.1})`,
                    opacity: Math.max(0, 0.65 - life * 0.7),
                  }}
                />
                <img
                  className="rf-battle__explosion-smoke rf-battle__explosion-smoke--b"
                  src={getSpriteUrl("fx-smoke")}
                  alt=""
                  style={{
                    width: 95,
                    height: 95,
                    transform: `translate(${-8 - life * 14}px, ${-10 - life * 56}px) scale(${0.7 + life * 1.25})`,
                    opacity: Math.max(0, 0.55 - life * 0.65),
                  }}
                />
                <span
                  className="rf-battle__sparks"
                  style={{
                    opacity: Math.max(0, 0.95 - life * 1.35),
                    transform: `scale(${0.7 + life * 0.5})`,
                  }}
                />
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
