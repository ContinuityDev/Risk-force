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

const FIELD_W = 640;
const FIELD_H = 360;

function worldToPx(x: number, y: number) {
  return {
    left: (x / 16) * FIELD_W,
    top: (y / 8) * FIELD_H,
  };
}

function projectileVisual(p: BattleState["projectiles"][number]) {
  const x = p.x + (p.tx - p.x) * p.progress;
  const y = p.y + (p.ty - p.y) * p.progress;
  const pos = worldToPx(x, y);
  const style = p.style;

  if (style === "laser" || style === "rail" || style === "orbital") {
    const from = worldToPx(p.x, p.y);
    const to = worldToPx(p.tx, p.ty);
    return (
      <line
        key={p.id}
        x1={from.left}
        y1={from.top}
        x2={to.left}
        y2={to.top}
        className={`rf-battle__beam rf-battle__beam--${style}`}
        strokeOpacity={Math.max(0.2, 1 - p.progress)}
      />
    );
  }

  return (
    <circle
      key={p.id}
      cx={pos.left}
      cy={pos.top}
      r={style === "plasma" || style === "missile" ? 5 : 3.5}
      className={`rf-battle__orb rf-battle__orb--${style}`}
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
        <svg
          className="rf-battle__field"
          viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
          width="100%"
          height="100%"
        >
          <defs>
            <linearGradient id="rf-field-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#121a24" />
              <stop offset="100%" stopColor="#0c121a" />
            </linearGradient>
          </defs>
          <rect width={FIELD_W} height={FIELD_H} fill="url(#rf-field-bg)" />
          <line
            x1={FIELD_W * 0.5}
            y1={12}
            x2={FIELD_W * 0.5}
            y2={FIELD_H - 12}
            stroke="#243041"
            strokeDasharray="4 6"
            strokeWidth="1"
          />

          {battle.defenses.map((d) => {
            if (!d.alive && d.anim !== "destroyed") return null;
            const pos = worldToPx(d.x, d.y);
            let spriteId = "building-shield";
            try {
              spriteId = getBuilding(d.buildingId).sprite.id;
            } catch {
              /* keep fallback */
            }
            return (
              <g key={d.id} transform={`translate(${pos.left}, ${pos.top})`}>
                <image
                  href={getSpriteUrl(spriteId)}
                  x={-18}
                  y={-18}
                  width={36}
                  height={36}
                  opacity={d.alive ? 1 : 0.35}
                  className={
                    d.anim === "firing"
                      ? "rf-battle__flash"
                      : d.anim === "destroyed"
                        ? "rf-battle__fade"
                        : undefined
                  }
                />
                {d.alive && (
                  <g transform="translate(-16, -26)">
                    <rect width={32} height={3} fill="#1a2330" />
                    <rect
                      width={32 * Math.max(0, d.hp / d.maxHp)}
                      height={3}
                      fill="#6aaa8a"
                    />
                  </g>
                )}
              </g>
            );
          })}

          {battle.units.map((u) => {
            if (!u.alive && u.anim !== "destroyed") return null;
            const pos = worldToPx(u.x, u.y);
            let spriteId = "unit-trooper";
            try {
              spriteId = getUnit(u.unitId).sprite.id;
            } catch {
              /* keep fallback */
            }
            return (
              <g key={u.id} transform={`translate(${pos.left}, ${pos.top})`}>
                <image
                  href={getSpriteUrl(spriteId)}
                  x={-14}
                  y={-14}
                  width={28}
                  height={28}
                  opacity={u.alive ? 1 : 0.3}
                  className={
                    u.anim === "attack"
                      ? "rf-battle__flash"
                      : u.anim === "destroyed"
                        ? "rf-battle__fade"
                        : undefined
                  }
                />
                {u.alive && (
                  <g transform="translate(-14, -22)">
                    <rect width={28} height={3} fill="#1a2330" />
                    <rect
                      width={28 * Math.max(0, u.hp / u.maxHp)}
                      height={3}
                      fill={
                        u.side === "attacker" ? "#7eb6c9" : "#c07070"
                      }
                    />
                  </g>
                )}
              </g>
            );
          })}

          {battle.projectiles.map(projectileVisual)}

          {battle.explosions.map((ex) => {
            const pos = worldToPx(ex.x, ex.y);
            return (
              <image
                key={ex.id}
                href={getSpriteUrl("fx-explosion")}
                x={pos.left - 16}
                y={pos.top - 16}
                width={32}
                height={32}
                opacity={Math.max(0, 1 - ex.t)}
              />
            );
          })}
        </svg>

        <aside className="rf-battle__log">
          <span className="rf-label">Combat log</span>
          <ul>
            {battle.log.slice(-12).map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
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
        <Sprite id="fx-laser" size={20} anim="none" />
        <span className="rf-text-dim">Live fire · {battle.elapsed.toFixed(1)}s</span>
      </div>
    </div>
  );
}
