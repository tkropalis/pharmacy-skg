import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dictionary } from '../../i18n/index.ts';
import { fill } from '../../lib/format.ts';
import type { Locality } from '../../lib/places.ts';
import { PIN_KINDS } from '../../lib/list.ts';
import { pinSvg } from '../../lib/pins.ts';
import { AreaPicker } from './AreaPicker.tsx';
import { Icon } from './icons.tsx';
import { Segmented } from './Segmented.tsx';

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
  readonly onUseLocation: () => void;
  readonly onPickArea: (locality: Locality) => void;
  readonly onClear: () => void;
  /** The card puts the options toggle at the end of its button row. */
  readonly extra?: ReactNode;
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
  onUseLocation,
  onPickArea,
  onClear,
  extra,
}: OriginControlsProps) {
  const headingId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const card = variant === 'card';
  const locating = geo === 'locating';
  const geoMessage =
    geo === 'denied'
      ? text.origin.deniedShort
      : geo === 'unavailable' || geo === 'unsupported'
        ? text.origin.unavailable
        : null;

  const buttons = (
    <div className="control-row">
      <button type="button" className="action primary" disabled={locating} onClick={onUseLocation}>
        <span className={locating ? 'spin' : undefined}>
          <Icon name="locate" />
        </span>
        {locating ? text.origin.locating : text.origin.useLocation}
      </button>
      <button
        type="button"
        className="action"
        aria-haspopup="dialog"
        onClick={() => setPickerOpen(true)}
      >
        <Icon name="map" />
        {text.origin.areaLabel}
      </button>
      {extra}
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
    <AreaPicker
      text={text}
      localities={localities}
      onPick={onPickArea}
      onClose={() => setPickerOpen(false)}
    />
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
    <section className="control" aria-labelledby={headingId}>
      <h2 id={headingId} className="control-title">
        {text.origin.heading}
      </h2>
      {buttons}
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

interface NearbyCardProps extends Omit<OriginControlsProps, 'variant' | 'origin' | 'extra'> {
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
      <h2 id={id} className="sr-only">
        {text.nearby.title}
      </h2>
      <OriginControls
        text={text}
        variant="card"
        origin={null}
        {...rest}
        extra={
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
        }
      />
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

/**
 * "All" and "On duty": by day, so people can see only the duty pharmacies. The count is in the
 * summary line, for the chosen one; each option carries its own in data-count (tests).
 */
export function ListFilterChips({
  text,
  active,
  allCount,
  dutyCount,
  onChange,
}: ListFilterChipsProps) {
  return (
    <Segmented
      mode="toggle"
      compact
      buttonClass="chip"
      label={text.list.filterLabel}
      value={active}
      options={[
        { id: 'all', label: text.list.filterAll, count: allCount },
        { id: 'duty', label: text.list.filterDuty, count: dutyCount },
      ]}
      onChange={onChange}
    />
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
      <Segmented
        mode="toggle"
        labelledBy={`${id}-h`}
        value={custom ? 'custom' : 'now'}
        options={[
          { id: 'now', label: text.time.now },
          { id: 'custom', label: text.time.other },
        ]}
        onChange={(choice) => {
          if (choice === 'now') onNow();
          else if (!custom) onCustom(currentDate, currentTime);
        }}
      />
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
    <section className="control">
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
        <summary>
          {text.filters.legend}
          <span className="chev" aria-hidden="true">
            <Icon name="chevron" />
          </span>
        </summary>
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
