import { useEffect, useRef, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "right" | "bottom" | "left";
  className?: string;
  /** Optional id for tutorial targeting */
  tutorialId?: string;
  /** Desktop inline panel — no backdrop / swipe */
  inline?: boolean;
  children: ReactNode;
}

/**
 * Slide-in panel with backdrop tap-to-close and swipe-to-dismiss.
 * `inline` renders a static aside for desktop layouts.
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  className = "",
  tutorialId,
  inline = false,
  children,
}: DrawerProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open || inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, inline]);

  if (!open) return null;

  if (inline) {
    return (
      <aside
        className={`rf-drawer rf-drawer--inline ${className}`.trim()}
        data-tutorial={tutorialId}
      >
        {children}
      </aside>
    );
  }

  return (
    <div className={`rf-drawer-root rf-drawer-root--${side}`}>
      <button
        type="button"
        className="rf-drawer__backdrop"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className={`rf-drawer rf-drawer--${side} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        data-tutorial={tutorialId}
        onPointerDown={(e) => {
          startRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s = startRef.current;
          startRef.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (side === "right" && dx > 72) onClose();
          if (side === "left" && dx < -72) onClose();
          if (side === "bottom" && dy > 72) onClose();
        }}
      >
        <div className="rf-drawer__handle" aria-hidden />
        {children}
      </aside>
    </div>
  );
}
