import type { ResourceId } from "../data/types";

/** Distinct sci-fi glyph for each resource / campaign. */
export function ResourceIcon({
  id,
  className,
}: {
  id: ResourceId | "campaign";
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    "aria-hidden": true as const,
    className: `rf-res-icon rf-res-icon--${id}${className ? ` ${className}` : ""}`,
  };
  switch (id) {
    case "energy":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M13 2 4 13h6l-1 9 11-14h-7l2-6Z"
          />
        </svg>
      );
    case "alloy":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.2 6.5 3.6v7.4L12 18.8 5.5 15.2V7.8L12 4.2Z"
          />
        </svg>
      );
    case "research":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
          />
        </svg>
      );
    case "supply":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M4 8h16l-1.2 11H5.2L4 8Zm2.2-3h11.6l.8 2.2H5.4L6.2 5Z"
          />
        </svg>
      );
    case "campaign":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M5 20V6l7-3 7 3v14h-4v-6H9v6H5Zm6-2h2v-4h-2v4Z"
          />
        </svg>
      );
  }
}
