interface PickerOption {
  id: string;
  label: string;
  meta?: string;
}

interface PickerListProps {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (id: string) => void;
  emptyText?: string;
}

/** Large tappable list — replaces native &lt;select&gt; on mobile. */
export function PickerList({
  label,
  options,
  value,
  onChange,
  emptyText = "None available",
}: PickerListProps) {
  return (
    <div className="rf-picker" data-tutorial="picker">
      <span className="rf-label">{label}</span>
      {options.length === 0 ? (
        <p className="rf-hint">{emptyText}</p>
      ) : (
        <ul className="rf-picker__list">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={value === o.id ? "primary" : "ghost"}
                onClick={() => onChange(o.id)}
              >
                <strong>{o.label}</strong>
                {o.meta && <small>{o.meta}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
