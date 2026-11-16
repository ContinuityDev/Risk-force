/**
 * Conflict-of-Nations-style grounded map markers:
 * soft contact shadows (separate underlay layer), slight isometric lean,
 * muted faction cues, pill count tags — no circular badges/discs.
 */
import {
  groundedBuildingFootprint,
  groundedUnitFootprint,
  muteFactionColor,
  type GroundedFootprint,
} from "../map/groundedChrome";

interface UnitMiniProps {
  territoryId: string;
  size: number;
  zoomScale: number;
  factionHex: string;
  spriteUrl?: string;
  count?: number;
  compact?: boolean;
  transit?: boolean;
  more?: number;
  /** When true, only the contact shadow is drawn (for the underlay pass). */
  shadowOnly?: boolean;
  /** When true, omit the contact shadow (sprite/chrome pass). */
  omitShadow?: boolean;
}

interface BuildingMiniProps {
  territoryId: string;
  clipId: string;
  size: number;
  zoomScale: number;
  factionHex: string;
  spriteUrl?: string;
  count?: number;
  compact?: boolean;
  constructing?: boolean;
  progress?: number;
  more?: number;
  shadowOnly?: boolean;
  omitShadow?: boolean;
}

function CountTag({
  tag,
  text,
  fill,
}: {
  tag: { x: number; y: number; w: number; h: number; font: number };
  text: string;
  fill: string;
}) {
  return (
    <g className="rf-map__count-tag" pointerEvents="none">
      <rect
        x={tag.x}
        y={tag.y - tag.h}
        width={tag.w}
        height={tag.h}
        rx={tag.h * 0.35}
        fill="rgba(10,16,22,0.78)"
        stroke={fill}
        strokeWidth={tag.h * 0.08}
        opacity={0.95}
      />
      <text
        x={tag.x + tag.w / 2}
        y={tag.y - tag.h / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={tag.font}
        fill="rgba(232,238,244,0.92)"
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}

/** Soft elliptical contact shadow — drawn in the underlay layer only. */
export function GroundedContactShadow({
  fp,
  kind = "unit",
}: {
  fp: GroundedFootprint;
  kind?: "unit" | "building";
}) {
  return (
    <ellipse
      className="rf-map__contact-shadow"
      cx={fp.shadow.cx}
      cy={fp.shadow.cy}
      rx={fp.shadow.rx}
      ry={fp.shadow.ry}
      fill={
        kind === "building" ? "rgba(4,8,12,0.5)" : "rgba(4,8,12,0.48)"
      }
      filter="url(#rf-contact-shadow)"
      pointerEvents="none"
    />
  );
}

export function GroundedUnitMini({
  territoryId,
  size,
  zoomScale,
  factionHex,
  spriteUrl,
  count = 0,
  compact,
  transit,
  more,
  shadowOnly,
  omitShadow,
}: UnitMiniProps) {
  const col = muteFactionColor(factionHex, transit ? 0.22 : 0.38);
  if (more != null) {
    if (more <= 0) return null;
    const fp = groundedUnitFootprint(size * 0.85, zoomScale, { compact: true });
    if (shadowOnly) {
      return <GroundedContactShadow fp={fp} kind="unit" />;
    }
    return (
      <g className="rf-map__unit-more is-grounded">
        {!omitShadow && <GroundedContactShadow fp={fp} kind="unit" />}
        <rect
          className="rf-map__unit-hit"
          data-territory-id={territoryId}
          x={fp.hit.x}
          y={fp.hit.y}
          width={fp.hit.w}
          height={fp.hit.h}
          fill="transparent"
        />
        <text
          y={-size * 0.15}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.max(2.2 * zoomScale, size * 0.38)}
          fill="rgba(220,230,238,0.9)"
          pointerEvents="none"
        >
          +{more}
        </text>
      </g>
    );
  }

  const fp = groundedUnitFootprint(size, zoomScale, {
    count,
    compact,
    transit,
  });
  if (shadowOnly) {
    return <GroundedContactShadow fp={fp} kind="unit" />;
  }
  const countText = count > 9 ? "9+" : String(count);

  return (
    <g
      className={`rf-map__unit is-grounded${compact ? " is-compact" : ""}${
        transit ? " is-transit" : ""
      }`}
      opacity={transit ? 0.9 : 1}
    >
      {!omitShadow && <GroundedContactShadow fp={fp} kind="unit" />}
      <rect
        className="rf-map__unit-hit"
        data-territory-id={territoryId}
        x={fp.hit.x}
        y={fp.hit.y}
        width={fp.hit.w}
        height={fp.hit.h}
        fill="transparent"
      />
      <g
        className="rf-map__unit-sprite"
        transform={`skewX(${fp.skewX}) scale(1 ${fp.scaleY})`}
        pointerEvents="none"
      >
        {spriteUrl ? (
          <image
            href={spriteUrl}
            x={fp.sprite.x}
            y={fp.sprite.y}
            width={fp.sprite.w}
            height={fp.sprite.h}
            preserveAspectRatio="xMidYMax meet"
            opacity={0.96}
            filter="url(#rf-sprite-knockout)"
          />
        ) : (
          <path
            d={`M ${-fp.sprite.w * 0.18} ${fp.sprite.y + fp.sprite.h - fp.footInset}
                L ${-fp.sprite.w * 0.12} ${fp.sprite.y + fp.sprite.h * 0.35}
                L ${fp.sprite.w * 0.12} ${fp.sprite.y + fp.sprite.h * 0.35}
                L ${fp.sprite.w * 0.18} ${fp.sprite.y + fp.sprite.h - fp.footInset} Z
                M ${-fp.sprite.w * 0.08} ${fp.sprite.y + fp.sprite.h * 0.35}
                L 0 ${fp.sprite.y + fp.sprite.h * 0.12}
                L ${fp.sprite.w * 0.08} ${fp.sprite.y + fp.sprite.h * 0.35}`}
            fill={col}
            opacity={0.75}
          />
        )}
      </g>
      {fp.countTag && (
        <CountTag tag={fp.countTag} text={countText} fill={col} />
      )}
    </g>
  );
}

export function GroundedBuildingMini({
  territoryId,
  clipId,
  size,
  zoomScale,
  factionHex,
  spriteUrl,
  count,
  compact,
  constructing,
  progress = 0,
  more,
  shadowOnly,
  omitShadow,
}: BuildingMiniProps) {
  const col = muteFactionColor(factionHex, 0.42);
  if (more != null) {
    if (more <= 0) return null;
    const fp = groundedBuildingFootprint(size * 0.85, zoomScale, {
      compact: true,
    });
    if (shadowOnly) {
      return <GroundedContactShadow fp={fp} kind="building" />;
    }
    return (
      <g className="rf-map__bldg-more is-grounded">
        {!omitShadow && <GroundedContactShadow fp={fp} kind="building" />}
        <rect
          className="rf-map__bldg-hit"
          data-territory-id={territoryId}
          x={fp.hit.x}
          y={fp.hit.y}
          width={fp.hit.w}
          height={fp.hit.h}
          fill="transparent"
        />
        <text
          y={-size * 0.12}
          textAnchor="middle"
          dominantBaseline="middle"
          className="rf-map__bldg-more-txt"
          fontSize={Math.max(2.2 * zoomScale, size * 0.4)}
          fill="rgba(220,230,238,0.9)"
          pointerEvents="none"
        >
          +{more}
        </text>
      </g>
    );
  }

  if (compact && (count == null || count <= 0)) return null;

  const fp = groundedBuildingFootprint(size, zoomScale, {
    count,
    compact,
    constructing,
    progress,
  });
  if (shadowOnly) {
    return <GroundedContactShadow fp={fp} kind="building" />;
  }
  const countText =
    count != null && count > 0 ? (count > 9 ? "9+" : String(count)) : "";

  return (
    <g
      className={`rf-map__bldg is-grounded${constructing ? " is-building" : ""}${
        compact ? " is-compact" : ""
      }`}
      opacity={constructing ? 0.7 : 1}
    >
      {!omitShadow && <GroundedContactShadow fp={fp} kind="building" />}
      <rect
        className="rf-map__bldg-hit"
        data-territory-id={territoryId}
        x={fp.hit.x}
        y={fp.hit.y}
        width={fp.hit.w}
        height={fp.hit.h}
        fill="transparent"
      />
      <g
        className="rf-map__bldg-sprite"
        transform={`skewX(${fp.skewX}) scale(1 ${fp.scaleY})`}
        pointerEvents="none"
      >
        {spriteUrl ? (
          <g>
            {/* Clip the baked plinth at the bottom of building sprites. */}
            <clipPath id={clipId}>
              <rect
                x={fp.sprite.x}
                y={fp.sprite.y}
                width={fp.sprite.w}
                height={fp.sprite.h - fp.footInset}
              />
            </clipPath>
            <image
              href={spriteUrl}
              x={fp.sprite.x}
              y={fp.sprite.y - fp.sprite.h * 0.02}
              width={fp.sprite.w}
              height={fp.sprite.h}
              preserveAspectRatio="xMidYMax meet"
              opacity={0.62}
              filter="url(#rf-sprite-knockout)"
              clipPath={`url(#${clipId})`}
              className="rf-map__bldg-art"
            />
          </g>
        ) : (
          <rect
            x={fp.sprite.x + fp.sprite.w * 0.15}
            y={fp.sprite.y + fp.sprite.h * 0.25}
            width={fp.sprite.w * 0.7}
            height={fp.sprite.h * 0.7 - fp.footInset}
            rx={fp.sprite.w * 0.06}
            fill={col}
            opacity={0.55}
          />
        )}
      </g>
      {fp.progressBar && (
        <g pointerEvents="none">
          <rect
            x={-fp.shadow.rx * 0.7}
            y={fp.progressBar.y}
            width={fp.shadow.rx * 1.4}
            height={fp.progressBar.h}
            rx={fp.progressBar.h / 2}
            fill="rgba(8,14,20,0.55)"
          />
          <rect
            x={fp.progressBar.x}
            y={fp.progressBar.y}
            width={fp.progressBar.w}
            height={fp.progressBar.h}
            rx={fp.progressBar.h / 2}
            fill={col}
            opacity={0.9}
          />
        </g>
      )}
      {fp.countTag && countText && (
        <CountTag tag={fp.countTag} text={countText} fill={col} />
      )}
    </g>
  );
}
