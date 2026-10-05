import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import { THESSALONIKI, localToInstant, zonedDate, zonedParts } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { addDays, dateRange } from '../../lib/dates.ts';
import { upcomingDuties } from '../../lib/duties.ts';
import { coverage, distanceMetres, publishedDuties } from '../../lib/engine.ts';
import { formatUpdatedAt, formatUpdatedShort } from '../../lib/freshness.ts';
import { groupList, groupNames, groupNear } from '../../lib/groups.ts';
import { deviceZoneDiffers, fill, shortIsoDate } from '../../lib/format.ts';
import { buildRows, rowFor } from '../../lib/list.ts';
import type { Origin } from '../../lib/list.ts';
import { buildLocalities } from '../../lib/places.ts';
import type { Locality } from '../../lib/places.ts';
import { AREA_KEY, readItem, writeItem } from '../../lib/storage.ts';
import { Filters, OriginControls, TimeControls } from './Controls.tsx';
import type { GeoState, TimeMode } from './Controls.tsx';
import { MapView } from './MapView.tsx';
import type { MapFocus, MapStatus } from './MapView.tsx';
import { PharmacyRow } from './PharmacyRow.tsx';
import { Sheet } from './Sheet.tsx';
import type { SheetSize } from './Sheet.tsx';
import { UpcomingDuties } from './UpcomingDuties.tsx';
import { useCityData } from './use-city-data.ts';
import { useFavourites } from './use-favourites.ts';
import { useMediaQuery, useNow } from './use-now.ts';
import './app.css';

const PAGE_SIZE = 30;
const TIME_ZONE = THESSALONIKI.timeZone;
/// Further than this from the city centre, tell the person the distances are long.
const FAR_METRES = 40_000;
/** How many days beyond the last published duty list the time picker allows. */
const PICKER_DAYS_AHEAD = 7;
const FAVOURITE_DATES_MAX = 60;

type Tab = 'open' | 'favourites';

interface OriginState extends Origin {
  readonly kind: 'geo' | 'area';
  readonly label: string;
}

interface HomeAppProps {
  readonly locale: Locale;
  readonly text: Dictionary['app'];
  readonly title: string;
}

function clock(parts: { minutes: number }): string {
  const h = String(Math.floor(parts.minutes / 60)).padStart(2, '0');
  const m = String(parts.minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The instant of a chosen Athens date and time, or null while the inputs are incomplete. */
function chosenInstant(mode: TimeMode): Date | null {
  if (mode.kind !== 'custom' || !isIsoDate(mode.date) || !isClock(mode.time)) return null;
  try {
    return localToInstant(mode.date, mode.time, TIME_ZONE);
  } catch {
    return null;
  }
}

export default function HomeApp({ locale, text, title }: HomeAppProps) {
  const { state, retry, ensureDates } = useCityData();
  const now = useNow();
  const favourites = useFavourites();
  const wide = useMediaQuery('(min-width: 900px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [tab, setTab] = useState<Tab>('open');
  const [timeMode, setTimeMode] = useState<TimeMode>({ kind: 'now' });
  const [origin, setOrigin] = useState<OriginState | null>(null);
  const [originNonce, setOriginNonce] = useState(0);
  const [geo, setGeo] = useState<GeoState>('idle');
  const [showClosed, setShowClosed] = useState(false);
  // On a phone the controls start closed, so the first pharmacy is on screen without scrolling.
  const [controlsOpen, setControlsOpen] = useState(
    () => window.matchMedia('(min-width: 900px)').matches,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [sheetSize, setSheetSize] = useState<SheetSize>('medium');
  const [sheetHeight, setSheetHeight] = useState(0);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [message, setMessage] = useState('');
  const [mapStatus, setMapStatus] = useState<MapStatus>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingAnnouncement = useRef(false);
  const scrollTo = useRef<string | null>(null);

  const ready = state.status === 'ready' ? state : null;
  const data = ready?.data ?? null;
  const meta = ready?.meta ?? null;

  const customAt = chosenInstant(timeMode);
  const live = timeMode.kind === 'now' || customAt === null;
  const at = live ? now : (customAt ?? now);
  const today = zonedDate(now, TIME_ZONE);
  const atDate = zonedDate(at, TIME_ZONE);

  // The screen fills what is left of the first viewport below the header.
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (element === null) return;
    let lastWidth = 0;
    let lastHeight = 0;
    const fit = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Browser bars sliding in and out change the height a little; ignore that.
      if (width === lastWidth && Math.abs(height - lastHeight) < 150) return;
      lastWidth = width;
      lastHeight = height;
      const top = element.getBoundingClientRect().top + window.scrollY;
      element.style.setProperty('--hs-h', `${Math.max(480, Math.round(height - top))}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // --- Data for the chosen moment -------------------------------------------------

  const isReady = ready !== null;
  useEffect(() => {
    if (isReady) ensureDates(dateRange(addDays(atDate, -1), 5));
  }, [isReady, atDate, ensureDates]);

  const lastPublished = meta?.duties?.to ?? today;
  const maxDate = addDays(lastPublished < today ? today : lastPublished, PICKER_DAYS_AHEAD);
  const minDate = addDays(today, -1);

  // --- Remembered area ------------------------------------------------------------

  const localities: readonly Locality[] = useMemo(
    () => (data ? buildLocalities(data.pharmacies) : []),
    [data],
  );
  const restoredArea = useRef(false);
  useEffect(() => {
    if (restoredArea.current || localities.length === 0) return;
    restoredArea.current = true;
    const saved = readItem(AREA_KEY);
    const found = saved === null ? undefined : localities.find((l) => l.name === saved);
    if (found) {
      setOrigin({ kind: 'area', lat: found.lat, lon: found.lon, label: found.name });
      setOriginNonce((n) => n + 1);
      setControlsOpen(false);
    }
  }, [localities]);

  const originPoint: Origin | null = useMemo(
    () => (origin ? { lat: origin.lat, lon: origin.lon } : null),
    [origin],
  );

  // --- The list ---------------------------------------------------------------------

  const result = useMemo(
    () => (data ? buildRows(data, at, originPoint, showClosed) : { rows: [], openCount: 0 }),
    [data, at, originPoint, showClosed],
  );
  const covered = useMemo(() => (data ? coverage(data, at) : null), [data, at]);

  // The duty list that applies to the chosen moment is still being fetched: the list must not
  // say "none open" or "not published" yet, and nothing is announced.
  const dutyLoading =
    covered !== null &&
    meta?.duties != null &&
    covered.dutyDate >= meta.duties.from &&
    covered.dutyDate <= meta.duties.to &&
    !(data?.duties.has(covered.dutyDate) ?? false) &&
    !(ready?.failedDates.includes(covered.dutyDate) ?? false);

  // Each area group has its own list and a day's file can lack some of them.
  const names = useMemo(() => (data ? groupNames(data) : new Map<string, string>()), [data]);
  const originGroup = useMemo(() => {
    if (data === null || origin === null) return null;
    if (origin.kind === 'area') {
      return localities.find((l) => l.name === origin.label)?.groupId ?? null;
    }
    return groupNear(data.pharmacies, origin);
  }, [data, origin, localities]);
  const missingGroups =
    covered !== null && covered.duties && !dutyLoading ? covered.groups.missing : [];
  const originGroupMissing = originGroup !== null && missingGroups.includes(originGroup);

  useEffect(() => setVisible(PAGE_SIZE), [originPoint, timeMode, showClosed, tab]);

  const selectedIndex = selectedId
    ? result.rows.findIndex((row) => row.pharmacy.id === selectedId)
    : -1;
  const shownCount = Math.max(visible, selectedIndex + 1);
  const shownRows = result.rows.slice(0, shownCount);

  const summary = useMemo(() => {
    const n = result.openCount;
    const count =
      n === 0 ? text.summary.none : n === 1 ? text.summary.one : fill(text.summary.many, { n });
    const closed = result.rows.length - n;
    const sort = origin
      ? fill(text.summary.sortedByDistance, { origin: origin.label })
      : text.summary.sortedByName;
    return [count, closed > 0 ? fill(text.summary.withClosed, { n: closed }) : null, sort]
      .filter((part): part is string => part !== null)
      .join(' · ');
  }, [result, origin, text]);

  // Announce list changes politely, and only after something the person did (not each minute).
  useEffect(() => {
    if (!pendingAnnouncement.current || state.status !== 'ready' || dutyLoading) return;
    pendingAnnouncement.current = false;
    setMessage(fill(text.list.updated, { summary }));
  }, [summary, state.status, text, dutyLoading]);

  const announce = useCallback((value: string) => setMessage(value), []);

  // --- Actions ----------------------------------------------------------------------

  const selectOnMap = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMapFocus((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
      if (!wide && sheetSize === 'large') setSheetSize('medium');
    },
    [wide, sheetSize],
  );

  const onMapSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id === null) return;
      setTab('open');
      scrollTo.current = id;
      if (!wide && sheetSize === 'small') setSheetSize('medium');
    },
    [wide, sheetSize],
  );

  // Bring a row chosen on the map into view in the list.
  useEffect(() => {
    const id = scrollTo.current;
    if (id === null) return;
    const row = document.getElementById(`row-${id}`);
    if (row) {
      scrollTo.current = null;
      row.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  });

  function setAreaOrigin(locality: Locality) {
    pendingAnnouncement.current = true;
    writeItem(AREA_KEY, locality.name);
    setGeo('idle');
    setOrigin({ kind: 'area', lat: locality.lat, lon: locality.lon, label: locality.name });
    setOriginNonce((n) => n + 1);
    setControlsOpen(false);
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeo('unsupported');
      return;
    }
    setGeo('locating');
    // Only on this tap. The position stays in memory: it is never stored or sent anywhere.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        pendingAnnouncement.current = true;
        setGeo('idle');
        setOrigin({
          kind: 'geo',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: text.origin.myLocation,
        });
        setOriginNonce((n) => n + 1);
        setControlsOpen(false);
      },
      (error) => setGeo(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function clearOrigin() {
    pendingAnnouncement.current = true;
    writeItem(AREA_KEY, null);
    setOrigin(null);
    setGeo('idle');
    announce(text.origin.cleared);
  }

  function setNow() {
    pendingAnnouncement.current = true;
    setTimeMode({ kind: 'now' });
  }

  function setCustom(date: string, time: string) {
    pendingAnnouncement.current = true;
    setTimeMode({ kind: 'custom', date, time });
  }

  function toggleFavourite(id: string, name: string) {
    const added = favourites.toggle(id);
    announce(fill(added ? text.row.favouriteAdded : text.row.favouriteRemoved, { name }));
  }

  // --- Rendering --------------------------------------------------------------------

  const occluded = wide ? 0 : sheetHeight;

  const nowParts = zonedParts(now, TIME_ZONE);
  const differs = deviceZoneDiffers(at);
  const far =
    origin?.kind === 'geo' &&
    distanceMetres(origin, { lat: THESSALONIKI.center[1], lon: THESSALONIKI.center[0] }) >
      FAR_METRES;

  const showWhen =
    timeMode.kind === 'custom' && customAt !== null
      ? `${shortIsoDate(timeMode.date, locale)} ${timeMode.time}`
      : null;

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next: Tab = tab === 'open' ? 'favourites' : 'open';
      setTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    }
  }

  const header = (
    <>
      <div className="tabs" role="tablist" aria-label={text.tabs.label}>
        {(['open', 'favourites'] as const).map((id) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="panel"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => {
              setTab(id);
              if (!wide && sheetSize === 'small') setSheetSize('medium');
            }}
          >
            {id === 'open'
              ? live && timeMode.kind === 'now'
                ? text.tabs.open
                : text.tabs.openAt
              : text.tabs.favourites}
            {id === 'favourites' && favourites.ids.length > 0 && (
              <span className="count">{favourites.ids.length}</span>
            )}
          </button>
        ))}
      </div>
      <p className="summary">
        {ready && tab === 'open' ? (dutyLoading ? text.time.loadingDuties : summary) : ' '}
      </p>
      {meta && (
        <p className="fresh">
          {text.source.updated}{' '}
          <time dateTime={meta.updatedAt}>{formatUpdatedShort(meta.updatedAt, now, locale)}</time>
          {' · '}
          {text.source.short}
        </p>
      )}
    </>
  );

  const favouriteRows = useMemo(() => {
    if (!data) return [];
    return favourites.ids.map((id) => ({
      id,
      row: rowFor(data, id, at, originPoint),
      // From yesterday: a duty that started yesterday evening may still be running.
      duties: upcomingDuties(publishedDuties(data, id, addDays(today, -1)), now, TIME_ZONE),
    }));
  }, [data, favourites.ids, at, originPoint, today, now]);

  // Favourites show every officially published duty date, so load the whole published range.
  useEffect(() => {
    if (tab !== 'favourites' || !meta?.duties || favourites.ids.length === 0) return;
    const last = meta.duties.to;
    if (last < today) return;
    const days = Math.min(
      FAVOURITE_DATES_MAX,
      dateRange(today, 400).findIndex((d) => d === last) + 1,
    );
    ensureDates(dateRange(today, Math.max(days, 1)));
  }, [tab, meta, favourites.ids.length, today, ensureDates]);

  const dutiesLoading = Boolean(
    meta?.duties && data && meta.duties.to >= today && !data.duties.has(meta.duties.to),
  );

  const rowProps = {
    at,
    live: live && timeMode.kind === 'now',
    locale,
    text,
    onSelect: selectOnMap,
    onToggleFavourite: toggleFavourite,
    onMessage: announce,
  } as const;

  return (
    <div className="hs" ref={rootRef} data-wide={wide ? 'true' : 'false'}>
      <h1 className="sr-only">{title}</h1>

      <Sheet
        text={text}
        size={sheetSize}
        onSizeChange={setSheetSize}
        sidePanel={wide}
        header={header}
        scrollKey={tab}
        onHeight={setSheetHeight}
      >
        <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {state.status === 'loading' && <p className="state">{text.loading}</p>}
          {state.status === 'error' && (
            <div className="callout danger" role="alert">
              <p>
                <strong>{text.loadError}</strong> {text.loadErrorHint}
              </p>
              <button type="button" className="action primary" onClick={retry}>
                {text.retry}
              </button>
            </div>
          )}

          {ready && tab === 'open' && (
            <>
              <details
                className="panel"
                open={controlsOpen}
                onToggle={(event) => setControlsOpen(event.currentTarget.open)}
              >
                <summary>
                  <span>
                    {origin
                      ? fill(text.origin.current, { origin: origin.label })
                      : text.origin.summary}
                  </span>
                  <span className="muted">
                    {timeMode.kind === 'custom' && showWhen !== null ? showWhen : text.time.now}
                  </span>
                </summary>
                <OriginControls
                  text={text}
                  origin={origin}
                  geo={geo}
                  far={far}
                  localities={localities}
                  onNeedRoom={() => !wide && setSheetSize('large')}
                  onUseLocation={useMyLocation}
                  onPickArea={setAreaOrigin}
                  onClear={clearOrigin}
                />
                <TimeControls
                  text={text}
                  mode={timeMode}
                  minDate={minDate}
                  maxDate={maxDate}
                  deviceDiffers={differs}
                  onNow={setNow}
                  onCustom={setCustom}
                  currentDate={today}
                  currentTime={clock(nowParts)}
                />
                <Filters
                  text={text}
                  showClosed={showClosed}
                  onShowClosed={(value) => {
                    pendingAnnouncement.current = true;
                    setShowClosed(value);
                  }}
                />
              </details>

              {timeMode.kind === 'custom' && showWhen !== null && (
                <p className="notice strong">
                  {fill(text.time.showing, { when: showWhen })}{' '}
                  <button type="button" className="link-button" onClick={setNow}>
                    {text.time.backToNow}
                  </button>
                </p>
              )}
              {dutyLoading && (
                <p className="state" role="status">
                  {text.time.loadingDuties}
                </p>
              )}
              {!dutyLoading && covered && !covered.duties && (
                <p className="callout" role="note">
                  {timeMode.kind === 'now'
                    ? text.time.dutyNotPublishedToday
                    : text.time.dutyNotPublished}
                </p>
              )}
              {originGroupMissing && originGroup !== null && (
                <p className="callout danger" role="alert">
                  {fill(text.time.groupsMissingOrigin, { group: groupList([originGroup], names) })}
                </p>
              )}
              {missingGroups.length > 0 && !(originGroupMissing && missingGroups.length === 1) && (
                <p className="callout" role="note">
                  {fill(text.time.groupsMissing, {
                    groups: groupList(
                      missingGroups.filter((id) => id !== originGroup || !originGroupMissing),
                      names,
                    ),
                  })}
                </p>
              )}
              {covered && !covered.extendedHours && (
                <p className="callout" role="note">
                  {text.time.extendedNotPublished}
                </p>
              )}
              {ready.failedDates.length > 0 && (
                <p className="callout" role="note">
                  {text.moreDatesFailed}
                </p>
              )}

              {dutyLoading ? null : result.rows.length === 0 ? (
                <p className="state">{text.list.noneOpen}</p>
              ) : (
                <>
                  <ol className="rows" aria-label={text.list.label}>
                    {shownRows.map((row) => (
                      <PharmacyRow
                        key={row.pharmacy.id}
                        row={row}
                        selected={row.pharmacy.id === selectedId}
                        favourite={favourites.ids.includes(row.pharmacy.id)}
                        {...rowProps}
                      />
                    ))}
                  </ol>
                  {shownCount < result.rows.length && (
                    <p className="more">
                      <span className="muted">
                        {fill(text.list.showing, { shown: shownCount, total: result.rows.length })}
                      </span>
                      <button
                        type="button"
                        className="action"
                        onClick={() => setVisible(shownCount + PAGE_SIZE)}
                      >
                        {text.list.showMore}
                      </button>
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {ready && tab === 'favourites' && (
            <>
              <p className="hint">{text.favourites.deviceOnly}</p>
              {!favourites.persisted && <p className="callout">{text.favourites.notStored}</p>}
              {favouriteRows.length === 0 ? (
                <div className="state">
                  <p>
                    <strong>{text.favourites.empty}</strong>
                  </p>
                  <p>{text.favourites.emptyHint}</p>
                </div>
              ) : (
                <>
                  <p className="hint">{text.favourites.officialOnly}</p>
                  <ol className="rows" aria-label={text.tabs.favourites}>
                    {favouriteRows.map(({ id, row, duties }) =>
                      row === null ? (
                        <li key={id} className="row">
                          <p>{text.favourites.gone}</p>
                          <button
                            type="button"
                            className="action"
                            onClick={() => toggleFavourite(id, id)}
                          >
                            {text.favourites.remove}
                          </button>
                        </li>
                      ) : (
                        <PharmacyRow
                          key={id}
                          row={row}
                          selected={id === selectedId}
                          favourite
                          {...rowProps}
                        >
                          <UpcomingDuties
                            pharmacy={row.pharmacy}
                            duties={duties}
                            loading={dutiesLoading}
                            publishedThrough={meta?.duties?.to ?? null}
                            locale={locale}
                            text={text}
                            now={now}
                            onMessage={announce}
                          />
                        </PharmacyRow>
                      ),
                    )}
                  </ol>
                </>
              )}
            </>
          )}

          <footer className="source">
            {meta && (
              <p>
                {text.source.updated}{' '}
                <time dateTime={meta.updatedAt}>{formatUpdatedAt(meta.updatedAt, locale)}</time>
                {' · '}
                {text.source.sources}
              </p>
            )}
            <p>{text.source.map}</p>
            <p>{text.source.callFirst}</p>
          </footer>
        </div>
      </Sheet>

      <MapView
        locale={locale}
        text={text.map}
        enabled={ready !== null}
        rows={result.rows}
        origin={originPoint}
        originNonce={originNonce}
        selectedId={selectedId}
        focus={mapFocus}
        occludedBottom={occluded}
        sideBySide={wide}
        covered={!wide && sheetSize === 'large'}
        onSelect={onMapSelect}
        onStatus={setMapStatus}
      />

      <div className="sr-only" role="status" aria-live="polite" data-map={mapStatus}>
        {message}
      </div>
    </div>
  );
}
