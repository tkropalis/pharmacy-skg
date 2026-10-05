import { useId, useMemo, useState } from 'react';
import type { Dictionary } from '../../i18n/index.ts';
import { fill } from '../../lib/format.ts';
import { searchLocalities } from '../../lib/places.ts';
import type { Locality } from '../../lib/places.ts';
import { PIN_KINDS } from '../../lib/list.ts';
import { pinSvg } from '../../lib/pins.ts';
import { Icon } from './icons.tsx';

type Text = Dictionary['app'];

// --- Origin ---------------------------------------------------------------------

export type GeoState = 'idle' | 'locating' | 'denied' | 'unavailable' | 'unsupported';

export interface OriginView {
  readonly label: string;
  readonly kind: 'geo' | 'area';
}

interface OriginControlsProps {
  readonly text: Text;
  /** 'panel' is the full section of the options panel, 'card' the compact body of the nearby card. */
  readonly variant?: 'panel' | 'card';
  readonly origin: OriginView | null;
  readonly geo: GeoState;
  readonly far: boolean;
  readonly localities: readonly Locality[];
  /** The area search needs room (and the on-screen keyboard): ask for a bigger sheet. */
  readonly onNeedRoom: () => void;
  readonly onUseLocation: () => void;
  readonly onPickArea: (locality: Locality) => void;
  readonly onClear: () => void;
}

/** iPhone, iPod and iPad (which presents itself as a Mac with a touch screen). */
function isIos(): boolean {
  const agent = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(agent) || (agent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

export function OriginControls({
  text,
  variant = 'panel',
  origin,
  geo,
  far,
  localities,
  onNeedRoom,
  onUseLocation,
  onPickArea,
  onClear,
}: OriginControlsProps) {
  const inputId = useId();
  const hintId = useId();
  const listId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchLocalities(localities, query, 8), [localities, query]);
  const card = variant === 'card';
  const geoMessage =
    geo === 'denied'
      ? card
        ? text.origin.deniedShort
        : text.origin.denied
      : geo === 'unavailable'
        ? text.origin.unavailable
        : geo === 'unsupported'
          ? text.origin.unsupported
          : null;

  const buttons = (
    <div className="control-row">
      <button
        type="button"
        className="action primary"
        disabled={geo === 'locating'}
        onClick={onUseLocation}
      >
        <Icon name="locate" />
        {geo === 'locating' ? text.origin.locating : text.origin.useLocation}
      </button>
      <button
        type="button"
        className="action"
        aria-expanded={pickerOpen}
        aria-controls={`${inputId}-picker`}
        onClick={() => {
          if (!pickerOpen) onNeedRoom();
          setPickerOpen((open) => !open);
        }}
      >
        {card ? text.nearby.area : text.origin.areaLabel}
        <span className={`chev${pickerOpen ? ' up' : ''}`} aria-hidden="true">
          <Icon name="chevron" />
        </span>
      </button>
    </div>
  );

  const messages = (
    <>
      {geoMessage !== null && (
        <p className="notice" role="status">
          {geoMessage}
          {geo === 'denied' && (
            <> {isIos() ? text.origin.deniedHelpIos : text.origin.deniedHelpOther}</>
          )}
        </p>
      )}
      {far && <p className="notice">{text.origin.far}</p>}
    </>
  );

  const picker = pickerOpen && (
    <div id={`${inputId}-picker`} className="picker">
      <label htmlFor={inputId} className="field-label">
        {text.origin.areaSearch}
      </label>
      <input
        id={inputId}
        className="field"
        type="search"
        value={query}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-describedby={`${hintId} ${listId}-count`}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p id={hintId} className="hint">
        {text.origin.areaHint}
      </p>
      <p id={`${listId}-count`} className="sr-only" role="status">
        {matches.length === 0
          ? text.origin.areaNone
          : matches.length === 1
            ? text.origin.areaOne
            : fill(text.origin.areaCount, { n: matches.length })}
      </p>
      {matches.length === 0 ? (
        <p className="hint">{text.origin.areaNone}</p>
      ) : (
        <ul id={listId} className="picker-list">
          {matches.map((locality) => (
            <li key={locality.name}>
              <button
                type="button"
                className="picker-item"
                onClick={() => {
                  onPickArea(locality);
                  setPickerOpen(false);
                  setQuery('');
                }}
              >
                <span>{locality.name}</span>
                <span className="muted">
                  {fill(text.origin.areaPharmacies, { n: locality.count })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (card) {
    return (
      <div className="nearby-body">
        {buttons}
        {messages}
        {picker}
      </div>
    );
  }

  return (
    <section className="control" aria-labelledby={`${inputId}-h`}>
      <h2 id={`${inputId}-h`} className="control-title">
        {text.origin.heading}
      </h2>
      {buttons}
      <p className="hint">{text.origin.privacy}</p>
      {messages}
      {picker}

      {origin !== null && (
        <p className="current-origin">
          <span>{fill(text.origin.current, { origin: origin.label })}</span>
          <button type="button" className="link-button" onClick={onClear}>
            <Icon name="close" />
            {text.origin.clear}
          </button>
        </p>
      )}
    </section>
  );
}

// --- The header chip and the nearby card ----------------------------------------------

interface OriginChipProps {
  readonly text: Text;
  /** "My location", "Area Kalamaria" or "Finding your location…". */
  readonly label: string;
  /** The chosen time, when it is not "now". */
  readonly when: string | null;
  readonly locating: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}

/**
 * Always in the sheet header while there is a position (or one is being found): it shows where
 * the distances are measured from, and one tap opens the options (re-locate, pick an area,
 * time and filters). The options panel is the element with id CONTROLS_ID.
 */
export function OriginChip({ text, label, when, locating, open, onToggle }: OriginChipProps) {
  return (
    <button
      type="button"
      className="origin-chip controls-toggle"
      aria-expanded={open}
      aria-controls={CONTROLS_ID}
      onClick={onToggle}
    >
      <Icon name={locating ? 'locate' : 'map'} />
      <span className="chip-label">{label}</span>
      {when !== null && <span className="chip-when">{when}</span>}
      <span className="sr-only">: {text.origin.summary}</span>
      <span className={`chev${open ? ' up' : ''}`} aria-hidden="true">
        <Icon name="chevron" />
      </span>
    </button>
  );
}

/** The id of the options panel (location, time and filters) that the toggles control. */
export const CONTROLS_ID = 'controls';

interface NearbyCardProps extends Omit<OriginControlsProps, 'variant' | 'origin'> {
  readonly open: boolean;
  readonly onToggleControls: () => void;
}

/**
 * Shown at the top of the list while there is no position (denied, failed, not supported, or
 * the person cleared it): the way to get distances is the first thing on the screen, not behind
 * a collapsed panel. The small button at its corner opens the same options as the header chip.
 */
export function NearbyCard({ text, open, onToggleControls, ...rest }: NearbyCardProps) {
  const id = useId();
  return (
    <section className="nearby" aria-labelledby={id}>
      <h2 id={id} className="nearby-title">
        {text.nearby.title}
      </h2>
      <button
        type="button"
        className="nearby-options controls-toggle"
        aria-expanded={open}
        aria-controls={CONTROLS_ID}
        aria-label={text.origin.summary}
        onClick={onToggleControls}
      >
        <Icon name="sliders" />
      </button>
      <OriginControls text={text} variant="card" origin={null} {...rest} />
    </section>
  );
}

// --- The list filter -----------------------------------------------------------------

interface ListFilterChipsProps {
  readonly text: Text;
  readonly active: 'all' | 'duty';
  readonly allCount: number;
  readonly dutyCount: number;
  readonly onChange: (filter: 'all' | 'duty') => void;
}

/** "All (N)" and "On duty (M)": by day, so people can see only the duty pharmacies. */
export function ListFilterChips({
  text,
  active,
  allCount,
  dutyCount,
  onChange,
}: ListFilterChipsProps) {
  const chips = [
    { id: 'all', label: fill(text.list.filterAll, { n: allCount }) },
    { id: 'duty', label: fill(text.list.filterDuty, { n: dutyCount }) },
  ] as const;
  return (
    <div className="filter-chips" role="group" aria-label={text.list.filterLabel}>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="chip"
          aria-pressed={active === chip.id}
          onClick={() => onChange(chip.id)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

// --- Time -----------------------------------------------------------------------

export type TimeMode =
  | { readonly kind: 'now' }
  | { readonly kind: 'custom'; readonly date: string; readonly time: string };

interface TimeControlsProps {
  readonly text: Text;
  readonly mode: TimeMode;
  readonly minDate: string;
  readonly maxDate: string;
  readonly deviceDiffers: boolean;
  readonly onNow: () => void;
  readonly onCustom: (date: string, time: string) => void;
  /** The current Athens date and time, offered when switching to a chosen time. */
  readonly currentDate: string;
  readonly currentTime: string;
}

export function TimeControls({
  text,
  mode,
  minDate,
  maxDate,
  deviceDiffers,
  onNow,
  onCustom,
  currentDate,
  currentTime,
}: TimeControlsProps) {
  const id = useId();
  const custom = mode.kind === 'custom';
  return (
    <section className="control" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="control-title">
        {text.time.heading}
      </h2>
      <div className="segmented" role="group" aria-labelledby={`${id}-h`}>
        <button type="button" aria-pressed={!custom} onClick={onNow}>
          {text.time.now}
        </button>
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => !custom && onCustom(currentDate, currentTime)}
        >
          {text.time.other}
        </button>
      </div>
      {mode.kind === 'custom' && (
        <div className="control-row time-fields">
          <div>
            <label className="field-label" htmlFor={`${id}-date`}>
              {text.time.date}
            </label>
            <input
              id={`${id}-date`}
              className="field"
              type="date"
              min={minDate}
              max={maxDate}
              value={mode.date}
              onChange={(event) => {
                const value = event.target.value;
                if (value !== '') onCustom(value, mode.time);
              }}
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-time`}>
              {text.time.clock}
            </label>
            <input
              id={`${id}-time`}
              className="field"
              type="time"
              value={mode.time}
              onChange={(event) => {
                const value = event.target.value;
                if (value !== '') onCustom(mode.date, value);
              }}
            />
          </div>
        </div>
      )}
      <p className="hint">{custom || deviceDiffers ? text.time.zoneNote : ''}</p>
      {deviceDiffers && <p className="notice">{text.time.deviceDiffers}</p>}
    </section>
  );
}

// --- Filters and legend -----------------------------------------------------------

interface FiltersProps {
  readonly text: Text;
  readonly showClosed: boolean;
  readonly onShowClosed: (value: boolean) => void;
}

export function Filters({ text, showClosed, onShowClosed }: FiltersProps) {
  const id = useId();
  const legendLabels: Record<(typeof PIN_KINDS)[number], string> = {
    duty: text.status.legend.duty,
    regular: text.status.legend.regular,
    extended: text.status.legend.extended,
    'duty-unknown': text.status.legend.dutyUnknown,
    closed: text.status.legend.closed,
  };
  return (
    <section className="control" aria-label={text.filters.legend}>
      <label className="check" htmlFor={`${id}-closed`}>
        <input
          id={`${id}-closed`}
          type="checkbox"
          checked={showClosed}
          onChange={(event) => onShowClosed(event.target.checked)}
        />
        <span>{text.filters.showClosed}</span>
      </label>
      <details className="legend">
        <summary>{text.filters.legend}</summary>
        <ul>
          {PIN_KINDS.map((kind) => (
            <li key={kind}>
              <span
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: pinSvg(kind, { size: 24 }) }}
              />
              <span>{legendLabels[kind]}</span>
            </li>
          ))}
          <li>
            <span
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html: pinSvg('regular', { approximate: true, size: 24 }),
              }}
            />
            <span>{text.status.legend.approximate}</span>
          </li>
        </ul>
      </details>
    </section>
  );
}
