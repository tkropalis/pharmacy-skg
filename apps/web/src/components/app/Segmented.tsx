import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  /** Kept on the button as data-count (the browser tests read it). */
  readonly count?: number;
}

interface SegmentedProps<T extends string> {
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /**
   * 'tabs' is a tablist that controls #panel (the arrow keys move between the tabs); 'toggle'
   * is a group of pressed buttons.
   */
  readonly mode: 'tabs' | 'toggle';
  readonly label?: string;
  readonly labelledBy?: string;
  /** Smaller text, for the toolbar. */
  readonly compact?: boolean;
  /** Extra classes on the buttons (the browser tests find the filter by `.chip`). */
  readonly buttonClass?: string;
}

/**
 * The one segmented control of the app: a soft track with a white thumb that slides to the
 * chosen option (app.css, .seg). The tabs, the "all / on duty" filter and "now / another
 * time" are all this.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  mode,
  label,
  labelledBy,
  compact = false,
  buttonClass,
}: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const tabs = mode === 'tabs';

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!tabs) return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    if (next === undefined) return;
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  const style = { '--seg-count': options.length, '--seg-index': index } as CSSProperties;
  return (
    <div
      className={`seg${compact ? ' compact' : ''}`}
      role={tabs ? 'tablist' : 'group'}
      aria-label={label}
      aria-labelledby={labelledBy}
      style={style}
    >
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((option) => {
        const chosen = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={buttonClass}
            data-count={option.count}
            {...(tabs
              ? {
                  id: `tab-${option.id}`,
                  role: 'tab',
                  'aria-selected': chosen,
                  'aria-controls': 'panel',
                  tabIndex: chosen ? 0 : -1,
                }
              : { 'aria-pressed': chosen })}
            onKeyDown={onKeyDown}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
