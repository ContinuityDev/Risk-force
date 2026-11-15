import type { CSSProperties } from "react";
import { angleToDirFrame } from "../sprites/facing";
import {
  getDirectionCount,
  getDirectionalSheetUrl,
  getSpriteUrl,
} from "../sprites/registry";

interface DirSpriteProps {
  id: string;
  /** Smooth facing angle (radians); 0 = +X / east. */
  facing: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

/**
 * Shows one frame from a horizontal N-direction sheet, or falls back
 * to the single-facing PNG when no sheet exists.
 */
export function DirSprite({
  id,
  facing,
  size = 96,
  className = "",
  style,
  alt = "",
}: DirSpriteProps) {
  const dirs = getDirectionCount(id);
  const sheet = getDirectionalSheetUrl(id);
  const frame = angleToDirFrame(facing, dirs);

  if (!sheet || dirs <= 1) {
    return (
      <img
        src={getSpriteUrl(id)}
        alt={alt}
        draggable={false}
        className={className}
        style={{ width: size, height: size, objectFit: "contain", ...style }}
      />
    );
  }

  // Horizontal strip: N × size cells; show frame via background-position
  return (
    <span
      className={`rf-dir-sprite ${className}`.trim()}
      role="img"
      aria-label={alt || id}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        backgroundImage: `url(${sheet})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${dirs * 100}% 100%`,
        backgroundPosition: `${(frame / (dirs - 1)) * 100}% 0%`,
        ...style,
      }}
    />
  );
}
