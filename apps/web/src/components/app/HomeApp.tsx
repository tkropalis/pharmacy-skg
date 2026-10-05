import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import { THESSALONIKI, localToInstant, zonedDate, zonedParts } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { EMERGENCY_NUMBERS } from '../../config.ts';
import { addDays, dateRange } from '../../lib/dates.ts';
import { telUrl } from '../../lib/directions.ts';
import { upcomingDuties } from '../../lib/duties.ts';
import { coverage, distanceMetres, publishedDuties } from '../../lib/engine.ts';
import { formatUpdatedShort } from '../../lib/freshness.ts';
import { groupList, groupNames, groupNear } from '../../lib/groups.ts';
import { deviceZoneDiffers, fill, shortIsoDate } from '../../lib/format.ts';
import { applyListFilter, buildRows, rowFor } from '../../lib/list.ts';
import type { ListFilter, Origin, Row } from '../../lib/list.ts';
import {
  FIRST_FIX_OPTIONS,
  WATCH_MOVE_METRES,
  WATCH_OPTIONS,
  autoLocateDecision,
  geolocationPermission,
} from '../../lib/geolocation.ts';
import { localizedPath } from '../../i18n/routes.ts';
import { displayName } from '../../lib/names.ts';
import { buildLocalities } from '../../lib/places.ts';
import type { Locality } from '../../lib/places.ts';
import { describeStatus } from '../../lib/status-label.ts';
import { AREA_KEY, FILTER_KEY, LOCATION_KEY, readItem, writeItem } from '../../lib/storage.ts';
import {
  CONTROLS_ID,
  Filters,
  ListFilterChips,
  NearbyCard,
  OriginChip,
  OriginControls,
  TimeControls,
} from './Controls.tsx';
import type { GeoState, TimeMode } from './Controls.tsx';
import { Icon } from './icons.tsx';
import { MapView } from './MapView.tsx';
import type { MapFocus, MapSelection, MapStatus } from './MapView.tsx';
import { PharmacyRow } from './PharmacyRow.tsx';
import { Segmented } from './Segmented.tsx';
import { SelectionCard } from './SelectionCard.tsx';
import { Sheet } from './Sheet.tsx';
import type { SheetApi, SheetSize } from './Sheet.tsx';
import { ThemeChoice } from './ThemeChoice.tsx';
import { UpcomingDuties } from './UpcomingDuties.tsx';
import { isDutyLoading, useCityData } from './use-city-data.ts';
import { useFavourites } from './use-favourites.ts';
import { useMapStart } from './use-map-start.ts';
import { useMediaQuery, useNow } from './use-now.ts';
import { useNightLook } from './use-theme.ts';
import './app.css';

const PAGE_SIZE = 30;
const TIME_ZONE = THESSALONIKI.timeZone;
/// Further than this from the city centre, tell the person the distances are long.
const FAR_METRES = 40_000;
/** How many days beyond the last published duty list the time picker allows. */
const PICKER_DAYS_AHEAD = 7;
const FAVOURITE_DATES_MAX = 60;
/** How long a visible note ("link copied") stays. */
const TOAST_MS = 2200;
/** How many rows move to their new places when the list changes (the rest are off screen). */
const FLIP_ROWS = 12;

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

/**
 * The state before the data is ready: "finding your location" when the position will be asked
 * for by itself (so the nearby card does not flash up first), "unsupported" without geolocation.
 */
function initialGeo(): GeoState {
  if (!('geolocation' in navigator)) return 'unsupported';
  const decision = autoLocateDecision({
    dismissed: readItem(LOCATION_KEY) === 'off',
    areaChosen: readItem(AREA_KEY) !== null,
    permission: 'unknown',
  });
  return decision === 'locate' ? 'locating' : 'idle';
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
  const dark = useNightLook();

  const [tab, setTab] = useState<Tab>('open');
  const [timeMode, setTimeMode] = useState<TimeMode>({ kind: 'now' });
  const [origin, setOrigin] = useState<OriginState | null>(null);
  const [originNonce, setOriginNonce] = useState(0);
  const [geo, setGeo] = useState<GeoState>(initialGeo);
  const [showClosed, setShowClosed] = useState(false);
  // The options (location, time, filters) start closed, so the first pharmacy is on screen.
  const [controlsOpen, setControlsOpen] = useState(false);
  const [dutyFilter, setDutyFilter] = useState<ListFilter>(() =>
    readItem(FILTER_KEY) === 'duty' ? 'duty' : 'all',
  );
  // The chosen pharmacy (its marker on the map) and the open row; on a phone, a choice made on
  // the map lowers the sheet to a card (`peek`) and the size before it is restored after.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOnMap, setSelectedOnMap] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const sizeBeforePeek = useRef<SheetSize>('medium');
  const peekFocus = useRef<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [toast, setToast] = useState<{ readonly text: string; readonly key: number } | null>(null);
  const sheetApi = useRef<SheetApi | null>(null);
  const [sheetSize, setSheetSize] = useState<SheetSize>('medium');
  const [sheetHeight, setSheetHeight] = useState(0);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [message, setMessage] = useState('');
  const [mapStatus, setMapStatus] = useState<MapStatus>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingAnnouncement = useRef(false);
  const scrollTo = useRef<string | null>(null);

  const ready = state.status === 'ready' ? state : null;
  const mapStart = useMapStart(ready !== null);
  const wakeMap = mapStart.wake;
  const data = ready?.data ?? null;
  const meta = ready?.meta ?? null;

  const customAt = chosenInstant(timeMode);
  const live = timeMode.kind === 'now' || customAt === null;
  const at = live ? now : (customAt ?? now);
  const today = zonedDate(now, TIME_ZONE);
  const atDate = zonedDate(at, TIME_ZONE);

  // --- Data for the chosen moment -------------------------------------------------

  // Keyed on meta, which changes only on a full (re)load: a silent refresh replaces the settled
  // dates, so the chosen dates must be asked for again or a date that had failed stays
  // "loading". Not keyed on `data`, which changes as each date settles and would retry a
  // failed date in a loop while offline.
  const readyMeta = ready?.meta ?? null;
  useEffect(() => {
    if (readyMeta !== null) ensureDates(dateRange(addDays(atDate, -1), 5));
  }, [readyMeta, atDate, ensureDates]);

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

  const built = useMemo(
    () => (data ? buildRows(data, at, originPoint, showClosed) : { rows: [], openCount: 0 }),
    [data, at, originPoint, showClosed],
  );
  const result = useMemo(() => applyListFilter(built, dutyFilter), [built, dutyFilter]);
  const covered = useMemo(() => (data ? coverage(data, at) : null), [data, at]);

  // The duty list that applies to the chosen moment is being fetched right now: the list must
  // not say "none open" or "not published" yet, and nothing is announced. A date that has
  // settled (loaded, unpublished or failed) is not pending, so a gap in the published dates
  // shows the "not published" note and the regular rows at once.
  const dutyLoading = covered !== null && ready !== null && isDutyLoading(ready, covered.dutyDate);

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

  useEffect(() => setVisible(PAGE_SIZE), [originPoint, timeMode, showClosed, tab, result.active]);

  const selectedIndex = selectedId
    ? result.rows.findIndex((row) => row.pharmacy.id === selectedId)
    : -1;
  const shownCount = Math.max(visible, selectedIndex + 1);
  const shownRows = result.rows.slice(0, shownCount);

  // The count and how the list is sorted. `announcement` also says where from, which the
  // header chip shows on screen.
  const [summary, announcement] = useMemo(() => {
    const n = result.openCount;
    const duty = result.active === 'duty';
    const count = duty
      ? n === 0
        ? text.summary.dutyNone
        : n === 1
          ? text.summary.dutyOne
          : fill(text.summary.dutyMany, { n })
      : n === 0
        ? text.summary.none
        : n === 1
          ? text.summary.one
          : fill(text.summary.many, { n });
    const closed = result.rows.length - n;
    const withClosed = closed > 0 ? fill(text.summary.withClosed, { n: closed }) : null;
    const join = (parts: (string | null)[]) =>
      parts.filter((part): part is string => part !== null).join(' · ');
    // On screen only the count: the origin chip already says where the distances are from.
    const sort = origin === null && geo === 'locating' ? text.origin.locating : null;
    const sortFull = origin
      ? fill(text.summary.sortedByDistance, { origin: origin.label })
      : text.summary.sortedByName;
    return [join([count, withClosed, sort]), join([count, withClosed, sortFull])] as const;
  }, [result, origin, geo, text]);

  // Announce list changes politely, and only after something the person did (not each minute).
  useEffect(() => {
    if (!pendingAnnouncement.current || state.status !== 'ready' || dutyLoading) return;
    pendingAnnouncement.current = false;
    setMessage(fill(text.list.updated, { summary: announcement }));
  }, [announcement, state.status, text, dutyLoading]);

  const announce = useCallback((value: string) => setMessage(value), []);

  // --- Actions ----------------------------------------------------------------------

  /** Moves the map to a pharmacy; `size` is the size the sheet is going to, if it moves. */
  const focusOn = useCallback(
    (id: string, size: SheetSize | null) => {
      const occluded = wide ? 0 : size === null ? undefined : sheetApi.current?.heightFor(size);
      setMapFocus((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1, occluded }));
      // Asking for a pharmacy on the map must not wait for the map's timer.
      wakeMap();
    },
    [wide, wakeMap],
  );

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setExpandedId(null);
    if (peek) {
      setPeek(false);
      setSheetSize(sizeBeforePeek.current);
    }
  }, [peek]);

  /** A tap on a pin: the row opens and, on a phone, the sheet lowers to the chosen one's card. */
  const onMapSelect = useCallback(
    (id: string | null) => {
      if (id === null) {
        clearSelection();
        return;
      }
      setSelectedId(id);
      setSelectedOnMap(true);
      setTab('open');
      setExpandedId(id);
      if (wide) {
        scrollTo.current = id;
        return;
      }
      if (!peek) sizeBeforePeek.current = sheetSize === 'small' ? 'medium' : sheetSize;
      setPeek(true);
      setSheetSize('small');
      // The camera waits for the card, whose height it needs (see the layout effect below).
      peekFocus.current = id;
    },
    [wide, peek, sheetSize, clearSelection],
  );

  useLayoutEffect(() => {
    const id = peekFocus.current;
    if (id === null || !peek) return;
    peekFocus.current = null;
    focusOn(id, 'small');
  }, [peek, selectedId, focusOn]);

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

  /** A tap on a row: it opens (and its pharmacy is shown on the map) or closes. */
  function toggleRow(id: string, row: Row | null) {
    if (expandedId === id) {
      setExpandedId(null);
      if (selectedId === id) setSelectedId(null);
      return;
    }
    setExpandedId(id);
    if (row?.pharmacy.location == null) {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setSelectedOnMap(false);
    let size: SheetSize | null = null;
    if (!wide && sheetSize === 'large') {
      size = 'medium';
      setSheetSize(size);
    }
    focusOn(id, size);
  }

  function changeTab(next: Tab) {
    setTab(next);
    setSelectedId(null);
    setExpandedId(null);
    setPeek(false);
    if (!wide && sheetSize === 'small') setSheetSize('medium');
  }

  function changeSheetSize(size: SheetSize) {
    setSheetSize(size);
    // Pulling the sheet down is looking for the map.
    if (size === 'small') wakeMap();
    // Pulling the card up opens the list at the chosen pharmacy's row.
    if (peek && size !== 'small') {
      setPeek(false);
      scrollTo.current = selectedId;
    }
  }

  /** The person moved the map: the sheet gets out of the way (not the chosen pharmacy's card). */
  const onReach = useCallback(() => {
    if (!wide && !peek) setSheetSize((size) => (size === 'small' ? size : 'small'));
  }, [wide, peek]);

  const notify = useCallback((value: string) => {
    setMessage(value);
    setToast({ text: value, key: Date.now() });
  }, []);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function setAreaOrigin(locality: Locality) {
    pendingAnnouncement.current = true;
    writeItem(AREA_KEY, locality.name);
    setGeo('idle');
    setOrigin({ kind: 'area', lat: locality.lat, lon: locality.lon, label: locality.name });
    setOriginNonce((n) => n + 1);
    setControlsOpen(false);
  }

  /**
   * Asks the device for its position (the browser's own prompt appears on the first request).
   * `auto` is the request made when the app opens. The position stays in memory: only the flags
   * of the person's choices are stored, never coordinates.
   */
  function locate(auto: boolean) {
    if (!('geolocation' in navigator)) {
      setGeo('unsupported');
      return;
    }
    setGeo('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        pendingAnnouncement.current = true;
        // Asking for the position again is a choice for it: the opt-out and the area go.
        writeItem(LOCATION_KEY, null);
        writeItem(AREA_KEY, null);
        setGeo('idle');
        setOrigin({
          kind: 'geo',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: text.origin.here,
        });
        setOriginNonce((n) => n + 1);
        setControlsOpen(false);
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setGeo(denied ? 'denied' : 'unavailable');
        // A refused automatic request is not repeated on every visit: Safari's "Ask" setting and
        // a dismissed Chrome prompt both report "prompt" again next time. The card offers a retry.
        if (auto && denied) writeItem(LOCATION_KEY, 'off');
      },
      FIRST_FIX_OPTIONS,
    );
  }

  function clearOrigin() {
    pendingAnnouncement.current = true;
    writeItem(AREA_KEY, null);
    // Clearing the position is also saying "not now": it is not asked for again by itself.
    writeItem(LOCATION_KEY, 'off');
    setOrigin(null);
    setGeo('idle');
    announce(text.origin.cleared);
  }

  function changeFilter(filter: ListFilter) {
    pendingAnnouncement.current = true;
    writeItem(FILTER_KEY, filter === 'duty' ? 'duty' : null);
    setDutyFilter(filter);
  }

  function toggleControls() {
    setControlsOpen((open) => !open);
  }

  // The options are at the top of the list: show them even when the list was scrolled.
  useEffect(() => {
    if (controlsOpen) {
      document.getElementById(CONTROLS_ID)?.scrollIntoView({ block: 'nearest' });
    }
  }, [controlsOpen]);

  // Ask for the position by itself once the data is ready (the browser asks the person first),
  // unless they chose an area, turned the request off, or the browser has it blocked.
  const autoLocated = useRef(false);
  const dataReady = ready !== null;
  useEffect(() => {
    if (!dataReady || autoLocated.current) return;
    autoLocated.current = true;
    void geolocationPermission().then((permission) => {
      const decision = autoLocateDecision({
        dismissed: readItem(LOCATION_KEY) === 'off',
        // Read when the permission has come back: the saved area may have been restored since.
        areaChosen: readItem(AREA_KEY) !== null,
        permission,
      });
      if (decision === 'locate') locate(true);
      else if (decision === 'denied') setGeo('denied');
      else setGeo((current) => (current === 'locating' ? 'idle' : current));
    });
    // `locate` only reads state through setters and refs; the effect runs once.
  }, [dataReady]);

  // Follow the device while the page is visible, so the distances stay right as people walk.
  // The list is only re-sorted after a move of more than WATCH_MOVE_METRES.
  const following = origin?.kind === 'geo';
  useEffect(() => {
    if (!following || !('geolocation' in navigator)) return;
    let watchId: number | null = null;
    const start = () => {
      if (watchId !== null || document.visibilityState !== 'visible') return;
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const next = { lat: position.coords.latitude, lon: position.coords.longitude };
          setOrigin((previous) =>
            previous?.kind !== 'geo' || distanceMetres(previous, next) <= WATCH_MOVE_METRES
              ? previous
              : { ...previous, ...next },
          );
        },
        // A failed update keeps the last position; a position taken away stops following.
        (error) => {
          if (error.code === error.PERMISSION_DENIED) stop();
        },
        WATCH_OPTIONS,
      );
    };
    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [following]);

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

  // Escape lets the chosen pharmacy go (a dialog's own Escape closes the dialog only).
  const chosen = selectedId !== null;
  useEffect(() => {
    if (!chosen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('dialog')) return;
      clearSelection();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [chosen, clearSelection]);

  const showOriginChip = origin !== null || geo === 'locating';
  const showChips = !dutyLoading && result.chips;
  const header = (
    <>
      <Segmented
        mode="tabs"
        label={text.tabs.label}
        value={tab}
        onChange={changeTab}
        options={[
          {
            id: 'open',
            label: live && timeMode.kind === 'now' ? text.tabs.open : text.tabs.openAt,
          },
          {
            id: 'favourites',
            label: (
              <>
                {text.tabs.favourites}
                {favourites.ids.length > 0 && (
                  <span className="count" key={favourites.ids.length}>
                    {favourites.ids.length}
                  </span>
                )}
              </>
            ),
          },
        ]}
      />
      <div className="status-line">
        <p className="summary" key={tab === 'open' ? summary : tab}>
          {ready && tab === 'open' ? (dutyLoading ? text.time.loadingDuties : summary) : ' '}
        </p>
        <p className="fresh">
          {meta && (
            <a href={`${localizedPath(locale, 'about')}#credits`}>
              {text.source.tiny}{' '}
              <time dateTime={meta.updatedAt}>
                {formatUpdatedShort(meta.updatedAt, now, locale)}
              </time>
            </a>
          )}
        </p>
      </div>
      {ready && tab === 'open' && (showOriginChip || showChips) && (
        <div className="sheet-toolbar">
          {showOriginChip && (
            <OriginChip
              text={text}
              label={
                origin === null
                  ? text.origin.locating
                  : origin.kind === 'geo'
                    ? text.origin.myLocation
                    : fill(text.origin.areaName, { name: origin.label })
              }
              when={showWhen}
              locating={origin === null}
              open={controlsOpen}
              onToggle={toggleControls}
            />
          )}
          {showChips && (
            <ListFilterChips
              text={text}
              active={result.active}
              allCount={built.openCount}
              dutyCount={result.dutyCount}
              onChange={changeFilter}
            />
          )}
        </div>
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

  const rowLive = live && timeMode.kind === 'now';
  const rowProps = {
    at,
    live: rowLive,
    locale,
    text,
    onToggleFavourite: toggleFavourite,
    onMessage: notify,
  } as const;

  // The chosen pharmacy, from the list on the map (a favourite that is closed is not on it).
  const selectedRow = useMemo(
    () =>
      selectedId === null
        ? null
        : (result.rows.find((row) => row.pharmacy.id === selectedId) ?? null),
    [selectedId, result.rows],
  );
  const mapSelection: MapSelection | null = useMemo(() => {
    if (selectedRow === null) return null;
    const view = describeStatus({
      status: selectedRow.status,
      at,
      live: rowLive,
      locale,
      text: text.status,
    });
    return {
      id: selectedRow.pharmacy.id,
      name: displayName(selectedRow.pharmacy.name),
      when: view.short.timing,
      ripple: selectedOnMap,
    };
  }, [selectedRow, at, rowLive, locale, text, selectedOnMap]);

  // Say which pharmacy was chosen on the map (the marker is a picture).
  useEffect(() => {
    if (selectedOnMap && selectedRow !== null) {
      setMessage(fill(text.chosen, { name: displayName(selectedRow.pharmacy.name) }));
    }
    // Only when the choice changes, not each minute.
  }, [selectedOnMap, selectedRow?.pharmacy.id]);

  // A choice that left the list (a filter, another time) lets the card go.
  useEffect(() => {
    if (peek && selectedRow === null) clearSelection();
  }, [peek, selectedRow, clearSelection]);

  // The nearest pharmacy open now is the answer: it leads, with labelled Call and Directions.
  const leadId =
    tab === 'open' && origin !== null && rowLive && !dutyLoading
      ? (result.rows.find((row) => row.status.state !== 'closed')?.pharmacy.id ?? null)
      : null;

  // When the list changes because of something the person did (the filter, the place, the
  // time), the rows that stay slide to their new places and the new ones fade in (FLIP), so the
  // change can be followed. The first rows only; never on the minute's refresh.
  const listRef = useRef<HTMLOListElement>(null);
  const rowTops = useRef(new Map<string, number>());
  const flipKey = [
    tab,
    result.active,
    originNonce,
    showClosed,
    timeMode.kind === 'custom' ? `${timeMode.date} ${timeMode.time}` : 'now',
  ].join('|');
  const lastFlip = useRef(flipKey);
  useLayoutEffect(() => {
    const list = listRef.current;
    const items = list ? ([...list.children].slice(0, FLIP_ROWS) as HTMLElement[]) : [];
    const before = rowTops.current;
    const changed = lastFlip.current !== flipKey;
    const sameTab = lastFlip.current.split('|')[0] === tab;
    lastFlip.current = flipKey;
    rowTops.current = new Map(items.map((item) => [item.id, item.offsetTop]));
    if (!changed || !sameTab || reducedMotion || typeof Element.prototype.animate !== 'function') {
      return;
    }
    for (const item of items) {
      const top = before.get(item.id);
      if (top === undefined) {
        item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      } else if (top !== item.offsetTop) {
        item.animate(
          [{ transform: `translateY(${top - item.offsetTop}px)` }, { transform: 'none' }],
          { duration: 280, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
        );
      }
    }
  });

  // No position yet: the list starts with the locate / area row (NearbyCard).
  const showNearby = origin === null && geo !== 'locating';
  const showCard = peek && !wide && sheetSize === 'small' && selectedRow !== null;

  const timeNotice = timeMode.kind === 'custom' && showWhen !== null && (
    <p className="notice strong">
      {fill(text.time.showing, { when: showWhen })}{' '}
      <button type="button" className="link-button" onClick={setNow}>
        {text.time.backToNow}
      </button>
    </p>
  );

  return (
    <div
      className="hs"
      ref={rootRef}
      data-wide={wide ? 'true' : 'false'}
      data-selecting={selectedId !== null ? 'true' : undefined}
    >
      <h1 className="sr-only">{title}</h1>

      <Sheet
        text={text}
        size={sheetSize}
        onSizeChange={changeSheetSize}
        sidePanel={wide}
        header={
          showCard && selectedRow !== null ? (
            <SelectionCard
              row={selectedRow}
              at={at}
              live={rowLive}
              locale={locale}
              text={text}
              onClose={clearSelection}
            />
          ) : (
            header
          )
        }
        scrollKey={tab}
        onHeight={setSheetHeight}
        api={sheetApi}
      >
        <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} data-tab={tab} key={tab}>
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
              {showNearby && (
                <NearbyCard
                  text={text}
                  geo={geo}
                  far={far}
                  localities={localities}
                  open={controlsOpen}
                  onToggleControls={toggleControls}
                  onUseLocation={() => locate(false)}
                  onPickArea={setAreaOrigin}
                  onClear={clearOrigin}
                />
              )}
              {controlsOpen && (
                <div id={CONTROLS_ID} className="panel">
                  {/* While the nearby row shows, it is the location control: no second one. */}
                  {!showNearby && (
                    <OriginControls
                      text={text}
                      origin={origin}
                      geo={geo}
                      far={far}
                      localities={localities}
                      onUseLocation={() => locate(false)}
                      onPickArea={setAreaOrigin}
                      onClear={clearOrigin}
                    />
                  )}
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
                </div>
              )}

              {timeNotice}
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
                <p className="state">
                  {result.active === 'duty' ? text.list.noDuty : text.list.noneOpen}
                </p>
              ) : (
                <>
                  <h2 className="sr-only">{text.list.label}</h2>
                  <ol className="rows" aria-label={text.list.label} ref={listRef}>
                    {shownRows.map((row) => (
                      <PharmacyRow
                        key={row.pharmacy.id}
                        row={row}
                        lead={row.pharmacy.id === leadId}
                        selected={row.pharmacy.id === selectedId}
                        expanded={row.pharmacy.id === expandedId}
                        favourite={favourites.ids.includes(row.pharmacy.id)}
                        onToggle={(id) => toggleRow(id, row)}
                        {...rowProps}
                      />
                    ))}
                  </ol>
                  {shownCount < result.rows.length && (
                    <p className="more">
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
              {!favourites.persisted && <p className="callout">{text.favourites.notStored}</p>}
              {/* A chosen time applies here too: say so, as on the other tab. */}
              {timeNotice}
              {favouriteRows.length === 0 ? (
                <div className="state empty">
                  {/* The same star as the button the hint names. */}
                  <span className="empty-star" aria-hidden="true">
                    <Icon name="starOutline" size={18} />
                  </span>
                  <div>
                    <p>
                      <strong>{text.favourites.empty}</strong>
                    </p>
                    <p className="muted">{text.favourites.emptyHint}</p>
                  </div>
                </div>
              ) : (
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
                        expanded={id === expandedId}
                        favourite
                        onToggle={(rowId) => toggleRow(rowId, row)}
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
              )}
            </>
          )}

          {/* Not while loading: it would sit under the short loading note and then be pushed away. */}
          {state.status !== 'loading' && (
            <footer className="sheet-footer">
              <nav aria-label={text.footer.label}>
                <ul className="footer-links">
                  <li>
                    <a href={localizedPath(locale, 'about')}>{text.footer.about}</a>
                  </li>
                  <li>
                    <a href={localizedPath(locale, 'privacy')}>{text.footer.privacy}</a>
                  </li>
                  <li>
                    <a href={localizedPath(locale, 'report')}>{text.footer.report}</a>
                  </li>
                </ul>
              </nav>
              <p className="footer-note">{text.footer.emergency}</p>
              <p className="sos">
                <a href={telUrl(EMERGENCY_NUMBERS.ambulance)}>
                  <Icon name="phone" size={14} />
                  {EMERGENCY_NUMBERS.ambulance}
                </a>
                <a href={telUrl(EMERGENCY_NUMBERS.europe)}>
                  <Icon name="phone" size={14} />
                  {EMERGENCY_NUMBERS.europe}
                </a>
                <a href={telUrl(EMERGENCY_NUMBERS.poison)}>
                  <Icon name="phone" size={14} />
                  {text.footer.poison} {EMERGENCY_NUMBERS.poison}
                </a>
              </p>
              <p className="footer-note">{text.footer.disclaimer}</p>
              <ThemeChoice text={text.footer.theme} />
            </footer>
          )}
        </div>
      </Sheet>

      <MapView
        locale={locale}
        text={text.map}
        enabled={mapStart.started}
        waiting={ready !== null}
        onWake={wakeMap}
        rows={result.rows}
        origin={origin}
        originNonce={originNonce}
        selection={mapSelection}
        focus={mapFocus}
        occludedBottom={occluded}
        sideBySide={wide}
        dark={dark}
        covered={!wide && sheetSize === 'large'}
        onSelect={onMapSelect}
        onReach={onReach}
        onStatus={setMapStatus}
      />

      {toast !== null && (
        // Seen, not read out: the live region below says it.
        <p
          className="toast"
          key={toast.key}
          aria-hidden="true"
          style={{ bottom: wide ? undefined : `calc(${occluded}px + 0.75rem)` }}
        >
          {toast.text}
        </p>
      )}

      <div className="sr-only" role="status" aria-live="polite" data-map={mapStatus}>
        {message}
      </div>
    </div>
  );
}
