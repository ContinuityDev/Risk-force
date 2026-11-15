import type { CSSProperties } from "react";
import { getSpriteUrl } from "../sprites/registry";

export type SpriteAnim =
  | "idle"
  | "firing"
  | "destroyed"
  | "working"
  | "hit"
  | "move"
  | "attack"
  | "none";

interface SpriteProps {
  id: string;
  alt?: string;
  anim?: SpriteAnim;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}

export function Sprite({
  id,
  alt,
  anim = "idle",
  size,
  className = "",
  style,
}: SpriteProps) {
  const dim =
    size === undefined
      ? undefined
      : typeof size === "number"
        ? `${size}px`
        : size;

  return (
    <img
      src={getSpriteUrl(id)}
      alt={alt ?? id}
      draggable={false}
      className={`rf-sprite rf-sprite--${anim} ${className}`.trim()}
      style={{
        width: dim,
        height: dim,
        ...style,
      }}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fallback) {
          img.dataset.fallback = "1";
          img.src = getSpriteUrl("");
        }
      }}
    />
  );
}
