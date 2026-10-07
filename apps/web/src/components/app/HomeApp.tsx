import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { City, Locale } from '@pharmacy-skg/core';
import {
  CITIES,
  GREECE_TIME_ZONE,
  cityAt,
  cityById,
  hasRegularHours,
  localToInstant,
  zonedDate,
  zonedParts,
} from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { EMERGENCY_NUMBERS } from '../../config.ts';
import { addDays, dateRange } from '../../lib/dates.ts';
import { DATA_BASE_PATH } from '../../lib/data.ts';
import { telUrl } from '../../lib/directions.ts';
import { upcomingDuties } from '../../lib/duties.ts';
import { coverage, distanceMetres, publishedDuties } from '../../lib/engine.ts';
import { checkedAt, formatUpdatedShort } from '../../lib/freshness.ts';
import { whenIdle } from '../../lib/idle.ts';
import { groupList, groupNames, groupNear } from '../../lib/groups.ts';
import { deviceZoneDiffers, fill, shortIsoDate } from '../../lib/format.ts';
import { applyListFilter, buildRows, nextToOpen, rowFor } from '../../lib/list.ts';
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
import { buildLocalities, loadNationalPlaces, PLACES_PATH } from '../../lib/places.ts';
import type { NationalPlace } from '../../lib/places.ts';
import { rememberCity } from '../../lib/home-city.ts';
import type { Locality } from '../../lib/places.ts';
import { describeStatus } from '../../lib/status-label.ts';
import { AREA_KEY, FILTER_KEY, LOCATION_KEY, readItem, writeItem } from '../../lib/storage.ts';
import {
  forgetPosition,
  frequentPharmacies,
  loadPosition,
  loadVisits,
  recordVisit,
  rememberArea,
  savePosition,
} from '../../lib/memory.ts';
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
import { useOnline } from './use-online.ts';
import { useNightLook } from './use-theme.ts';
import './app.css';

const PAGE_SIZE = 30;
/** How many of the pharmacies that open next are listed when none is open. */
const NEXT_COUNT = 5;
const TIME_ZONE = GREECE_TIME_ZONE;
const greek = new Intl.Collator('el');
/** How many days beyond the last published duty list the time picker allows. */
const PICKER_DAYS_AHEAD = 7;
const FAVOURITE_DATES_MAX = 60;
/** How long a visible note ("link copied") stays. */
const TOAST_MS = 2200;
/** How many rows move to their new places when the list changes (the rest are off screen). */
const FLIP_ROWS = 12;

type Tab = 'open' | 'favourites';

interface OriginState extends Origin {
  /** The position now, the one remembered from an earlier visit, or a chosen area. */
  readonly kind: 'geo' | 'last' | 'area';
  readonly label: string;
}

interface HomeAppProps {
  /** The covered city shown first (lib/home-city.ts); the person's position or choice can change it. */
  readonly initialCity: City;
  readonly locale: Locale;
  readonly text: Dictionary['app'];
  readonly title: string;
}

/** How many are open, or on duty: "1032 ανοιχτά", "14 εφημερεύουν". */
function countText(text: Dictionary['app'], n: number, duty: boolean): string {
  const words = text.summary;
  if (duty) return n === 0 ? words.dutyNone : n === 1 ? words.dutyOne : fill(words.dutyMany, { n });
  return n === 0 ? words.none : n === 1 ? words.one : fill(words.many, { n });
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
    remembered: loadPosition() !== null,
  });
  return decision === 'locate' ? 'locating' : 'idle';
}

/**
 * Where the list starts measuring from: the position remembered from an earlier visit, unless
 * the person chose an area or turned the position off. It is replaced by a fresh position
 * where the browser gives one without asking.
 */
function initialOrigin(label: string): OriginState | null {
  if (readItem(LOCATION_KEY) === 'off' || readItem(AREA_KEY) !== null) return null;
  const remembered = loadPosition();
  return remembered === null
    ? null
    : { kind: 'last', lat: remembered.lat, lon: remembered.lon, label };
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

export default function HomeApp({ initialCity, locale, text, title }: HomeAppProps) {
  const [city, setCity] = useState(initialCity);
  const { state, retry, ensureDates } = useCityData(city.id);
  // Where the city's regular hours are not known, only pharmacies on duty are shown (D26).
  const dutyOnly = !hasRegularHours(city.id);
  const now = useNow();
  const favourites = useFavourites();
  const wide = useMediaQuery('(min-width: 900px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const dark = useNightLook();

  const [tab, setTab] = useState<Tab>('open');
  const [timeMode, setTimeMode] = useState<TimeMode>({ kind: 'now' });
  const [origin, setOrigin] = useState<OriginState | null>(() =>
    initialOrigin(text.origin.lastHere),
  );
  const [originNonce, setOriginNonce] = useState(0);
  const [geo, setGeo] = useState<GeoState>(initialGeo);
  const [showClosed, setShowClosed] = useState(false);
  // The pharmacies opened most, on the device only. Read when the favourites tab opens, so its
  // order does not change under the person while they use it.
  const [visits, setVisits] = useState(loadVisits);
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
  const peekFocus = useRef<{ readonly id: string; readonly withOrigin: boolean } | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  // The locate button found the position: choose the nearest open pharmacy once the list is
  // measured from it. `stale` is the data shown when the position is in another city, whose
  // own data has to load first.
  const [pickNearest, setPickNearest] = useState<{ readonly stale: unknown } | null>(null);
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

  // Right after a switch the data is still the previous city's: it is not shown with the new
  // city's name and rules, nor announced as its list.
  const ready = state.status === 'ready' && state.cityId === city.id ? state : null;
  const loading = state.status === 'loading' || (state.status === 'ready' && ready === null);
  const online = useOnline();
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
  // Every covered city's places (/data/places.json), read once the app is idle: a person can
  // type their town wherever it is. Until then, or offline before the first read, the picker
  // offers the other cities themselves.
  const [nationalPlaces, setNationalPlaces] = useState<readonly NationalPlace[]>([]);
  const started = ready !== null;
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const cancel = whenIdle(() => {
      void loadNationalPlaces(`${DATA_BASE_PATH}/${PLACES_PATH}`).then((places) => {
        if (!cancelled) setNationalPlaces(places);
      });
    }, 5000);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [started]);

  // The area picker also offers the other covered cities and their places; choosing one
  // switches to that city.
  const pickable: readonly Locality[] = useMemo(() => {
    const names = new Set(localities.map((l) => l.name));
    const others = CITIES.filter((c) => c.id !== city.id && !names.has(c.name.el)).map(
      (c): Locality => ({
        name: c.name.el,
        lat: c.center[1],
        lon: c.center[0],
        count: 0,
        groupId: null,
        cityId: c.id,
      }),
    );
    const cityNames = new Set(CITIES.map((c) => c.name.el));
    const elsewhere = nationalPlaces.flatMap((place): Locality[] => {
      const other = cityById(place.cityId);
      if (other === undefined || other.id === city.id || cityNames.has(place.name)) return [];
      return [
        {
          name: place.name,
          lat: place.lat,
          lon: place.lon,
          count: place.count,
          groupId: null,
          cityId: other.id,
          cityName: other.name[locale],
        },
      ];
    });
    return [...localities, ...others, ...elsewhere].sort((a, b) => greek.compare(a.name, b.name));
  }, [localities, city.id, nationalPlaces, locale]);
  const restoredArea = useRef(false);

  /** Shows another covered city, and opens on it next time. */
  const switchCity = useCallback(
    (next: City) => {
      if (next.id === city.id) return;
      rememberCity(next.id);
      setCity(next);
    },
    [city.id],
  );

  // The person moved the map into another covered area: its pharmacies load where the map is.
  const movedTo = useRef<string | null>(null);
  const onMapArea = useCallback(
    (next: City) => {
      pendingAnnouncement.current = true;
      movedTo.current = next.id;
      switchCity(next);
    },
    [switchCity],
  );

  // A new city: nothing chosen in the old one stays chosen, and the saved area is looked up
  // again in the new city's areas once they load, unless the person moved the map there (the
  // area would move it again).
  const shownCity = useRef(city.id);
  useEffect(() => {
    if (shownCity.current === city.id) return;
    shownCity.current = city.id;
    setSelectedId(null);
    setExpandedId(null);
    setPeek(false);
    setShowClosed(false);
    restoredArea.current = movedTo.current === city.id;
    movedTo.current = null;
  }, [city.id]);
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

  // A new position in another covered city: show that one. Only when the position changes, so
  // a city chosen afterwards (a favourite elsewhere) is not taken back.
  const followedOrigin = useRef<OriginState | null>(null);
  useEffect(() => {
    if (origin === followedOrigin.current) return;
    followedOrigin.current = origin;
    if (origin?.kind !== 'geo' && origin?.kind !== 'last') return;
    const here = cityAt(origin);
    if (here !== undefined) switchCity(here);
  }, [origin, switchCity]);

  // --- The list ---------------------------------------------------------------------

  const built = useMemo(
    () =>
      data ? buildRows(data, at, originPoint, showClosed && !dutyOnly) : { rows: [], openCount: 0 },
    [data, at, originPoint, showClosed, dutyOnly],
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
  // Nothing open at the chosen moment: the nearest pharmacies that open first take the list's
  // place, on the map too, so the list never just ends. Only with a position or an area: without
  // one, most open at the same hour and any five would be arbitrary.
  const nextRows = useMemo(
    () =>
      data !== null &&
      originPoint !== null &&
      !dutyLoading &&
      result.rows.length === 0 &&
      result.active === 'all'
        ? nextToOpen(data, at, originPoint, NEXT_COUNT)
        : [],
    [data, dutyLoading, result, at, originPoint],
  );
  const listRows = result.rows.length > 0 ? result.rows : nextRows;

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
    // In a city whose regular hours are unknown, every pharmacy shown is on duty: say so.
    const count = countText(text, n, result.active === 'duty' || dutyOnly);
    const closed = result.rows.length - n;
    const withClosed =
      closed === 0
        ? null
        : closed === 1
          ? text.summary.withClosedOne
          : fill(text.summary.withClosed, { n: closed });
    const join = (parts: (string | null)[]) =>
      parts.filter((part): part is string => part !== null).join(' · ');
    // On screen only the count: the origin chip already says where the distances are from.
    const sort = origin === null && geo === 'locating' ? text.origin.locating : null;
    const sortFull = origin
      ? fill(text.summary.sortedByDistance, { origin: origin.label })
      : text.summary.sortedByName;
    return [join([count, withClosed, sort]), join([count, withClosed, sortFull])] as const;
  }, [result, origin, geo, text, dutyOnly]);

  // Announce list changes politely, and only after something the person did (not each minute).
  useEffect(() => {
    if (!pendingAnnouncement.current || ready === null || dutyLoading) return;
    pendingAnnouncement.current = false;
    setMessage(fill(text.list.updated, { summary: announcement }));
  }, [announcement, ready, text, dutyLoading]);

  const announce = useCallback((value: string) => setMessage(value), []);

  // --- Actions ----------------------------------------------------------------------

  /**
   * Moves the map to a pharmacy; `size` is the size the sheet is going to, if it moves.
   * `withOrigin` shows the origin with it, however far.
   */
  const focusOn = useCallback(
    (id: string, size: SheetSize | null, withOrigin = false) => {
      const occluded = wide ? 0 : size === null ? undefined : sheetApi.current?.heightFor(size);
      setMapFocus((previous) => ({
        id,
        nonce: (previous?.nonce ?? 0) + 1,
        occluded,
        withOrigin,
      }));
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

  /**
   * A tap on a pin: the row opens and, on a phone, the sheet lowers to the chosen one's card.
   * `withOrigin` is the locate button's choice: the map shows the person and the pharmacy.
   */
  const onMapSelect = useCallback(
    (id: string | null, withOrigin = false) => {
      if (id === null) {
        clearSelection();
        return;
      }
      recordVisit(id, Date.now());
      setSelectedId(id);
      setSelectedOnMap(true);
      setTab('open');
      setExpandedId(id);
      if (wide) {
        scrollTo.current = id;
        if (withOrigin) focusOn(id, null, true);
        return;
      }
      if (!peek) sizeBeforePeek.current = sheetSize === 'small' ? 'medium' : sheetSize;
      setPeek(true);
      setSheetSize('small');
      // The camera waits for the card, whose height it needs (see the layout effect below).
      peekFocus.current = { id, withOrigin };
    },
    [wide, peek, sheetSize, clearSelection, focusOn],
  );

  useLayoutEffect(() => {
    const pending = peekFocus.current;
    if (pending === null || !peek) return;
    peekFocus.current = null;
    focusOn(pending.id, 'small', pending.withOrigin);
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
    recordVisit(id, Date.now());
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
    if (next === 'favourites') setVisits(loadVisits());
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
    rememberArea(locality.name);
    setGeo('idle');
    setOrigin({ kind: 'area', lat: locality.lat, lon: locality.lon, label: locality.name });
    setOriginNonce((n) => n + 1);
    setControlsOpen(false);
    // Another covered city: its data loads, and its area of the same name becomes the origin.
    const other = CITIES.find((c) => c.id === locality.cityId);
    if (other !== undefined) switchCity(other);
  }

  /**
   * Asks the device for its position (the browser's own prompt appears on the first request).
   * `auto` is the request made when the app opens; `pick` is the map's locate button, which
   * then chooses the nearest open pharmacy. The position is kept on the device, rounded
   * (lib/memory.ts), so the next visit starts from it without asking; it is never sent.
   */
  function locate(auto: boolean, pick = false) {
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
        const point = { lat: position.coords.latitude, lon: position.coords.longitude };
        savePosition(point, Date.now());
        setGeo('idle');
        setOrigin({ kind: 'geo', ...point, label: text.origin.here });
        setControlsOpen(false);
        if (pick) {
          // The camera moves once, to the person and the pharmacy chosen (below).
          const here = cityAt(point);
          setPickNearest({ stale: here !== undefined && here.id !== city.id ? data : null });
        } else {
          setOriginNonce((n) => n + 1);
        }
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setGeo(denied ? 'denied' : 'unavailable');
        // Refused: the remembered position is not used any more either.
        if (denied) {
          forgetPosition();
          setOrigin((current) => (current?.kind === 'last' ? null : current));
        }
        // A refused automatic request is not repeated on every visit: Safari's "Ask" setting and
        // a dismissed Chrome prompt both report "prompt" again next time. The card offers a retry.
        if (auto && denied) writeItem(LOCATION_KEY, 'off');
        // The list's own messages may be out of sight under the map: say it where they look.
        if (pick) notify(denied ? text.origin.deniedShort : text.origin.unavailable);
      },
      FIRST_FIX_OPTIONS,
    );
  }

  useEffect(() => {
    if (pickNearest === null || origin === null || ready === null || dutyLoading) return;
    // In another city, wait until its data has replaced the data shown when the position came.
    const here = cityAt(origin);
    if (here !== undefined && (here.id !== city.id || ready.data === pickNearest.stale)) return;
    setPickNearest(null);
    const nearest =
      here === undefined
        ? undefined
        : result.rows.find((row) => row.status.state !== 'closed' && row.pharmacy.location != null);
    if (nearest === undefined) {
      // Nothing open to choose (or the position is outside every covered area): show the person.
      setOriginNonce((n) => n + 1);
      return;
    }
    onMapSelect(nearest.pharmacy.id, true);
  }, [pickNearest, origin, ready, dutyLoading, city.id, result.rows, onMapSelect]);

  function clearOrigin() {
    pendingAnnouncement.current = true;
    writeItem(AREA_KEY, null);
    // Clearing the position is also saying "not now": it is not asked for again by itself,
    // and the remembered one is forgotten.
    writeItem(LOCATION_KEY, 'off');
    forgetPosition();
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
        remembered: loadPosition() !== null,
      });
      // 'remembered': the list already measures from the remembered position (initialOrigin).
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
          setOrigin((previous) => {
            if (previous?.kind !== 'geo' || distanceMetres(previous, next) <= WATCH_MOVE_METRES) {
              return previous;
            }
            savePosition(next, Date.now());
            return { ...previous, ...next };
          });
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
    const added = favourites.toggle(id, city.id);
    announce(fill(added ? text.row.favouriteAdded : text.row.favouriteRemoved, { name }));
  }

  // --- Rendering --------------------------------------------------------------------

  const occluded = wide ? 0 : sheetHeight;

  const nowParts = zonedParts(now, TIME_ZONE);
  const differs = deviceZoneDiffers(at);
  // The person's position is in no covered city: say so (the list is the city shown).
  const uncovered =
    (origin?.kind === 'geo' || origin?.kind === 'last') && cityAt(origin) === undefined;

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

  const showOriginChip =
    ready !== null && tab === 'open' && (origin !== null || geo === 'locating');
  const showChips = ready !== null && tab === 'open' && !dutyLoading && result.chips;
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
      {/* By day the filter is the count: "1032 ανοιχτά | 14 εφημερεύουν", full width. At night,
          when every open pharmacy is on duty, the count is plain text. */}
      {showChips ? (
        <div className="sheet-filter">
          <ListFilterChips
            text={text}
            active={result.active}
            allCount={built.openCount}
            dutyCount={result.dutyCount}
            allLabel={countText(text, built.openCount, false)}
            dutyLabel={countText(text, result.dutyCount, true)}
            onChange={changeFilter}
          />
        </div>
      ) : (
        tab === 'open' && (
          <p className="summary" key={summary}>
            {ready ? (dutyLoading ? text.time.loadingDuties : summary) : ' '}
          </p>
        )
      )}
      <div className="status-line">
        {showOriginChip && (
          <OriginChip
            text={text}
            label={
              origin === null
                ? text.origin.locating
                : origin.kind === 'geo'
                  ? text.origin.myLocation
                  : origin.kind === 'last'
                    ? text.origin.lastLocation
                    : fill(text.origin.areaName, { name: origin.label })
            }
            when={showWhen}
            locating={origin === null}
            open={controlsOpen}
            onToggle={toggleControls}
          />
        )}
        <p className="fresh">
          {meta && (
            <a href={`${localizedPath(locale, 'about')}#credits`}>
              {text.source.tiny}{' '}
              <time dateTime={checkedAt(meta)}>
                {formatUpdatedShort(checkedAt(meta), now, locale)}
              </time>
            </a>
          )}
          {!online && (
            <span className="offline-note">
              {meta && ' · '}
              {text.source.offline}
            </span>
          )}
        </p>
      </div>
    </>
  );

  const favouriteRows = useMemo(() => {
    if (!data) return [];
    return favourites.favourites
      .filter((favourite) => favourite.cityId === city.id)
      .map(({ id }) => ({
        id,
        row: rowFor(data, id, at, originPoint),
        // From yesterday: a duty that started yesterday evening may still be running.
        duties: upcomingDuties(publishedDuties(data, id, addDays(today, -1)), now, TIME_ZONE),
      }));
  }, [data, favourites.favourites, city.id, at, originPoint, today, now]);
  // Favourites saved in other cities: one button per city, which switches to it.
  const favouritesElsewhere = useMemo(
    () =>
      CITIES.filter((c) => c.id !== city.id)
        .map((c) => ({ city: c, n: favourites.favourites.filter((f) => f.cityId === c.id).length }))
        .filter(({ n }) => n > 0),
    [favourites.favourites, city.id],
  );
  // Credited in calendar files: the association that publishes the city's duty lists.
  const dutySource = meta?.sources[0]?.name[locale] ?? meta?.sources[0]?.name.el ?? '';

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

  const frequentRows = useMemo(() => {
    if (!data) return [];
    return frequentPharmacies(visits, favourites.ids).flatMap((id) => {
      const row = rowFor(data, id, at, originPoint);
      return row === null ? [] : [row];
    });
  }, [data, visits, favourites.ids, at, originPoint]);

  // A call or directions straight from a row counts as opening that pharmacy.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest('a[href]')?.closest('li[id^="row-"]');
      if (row) recordVisit(row.id.slice('row-'.length), Date.now());
    };
    root.addEventListener('click', onClick, true);
    return () => root.removeEventListener('click', onClick, true);
  }, []);

  const rowLive = live && timeMode.kind === 'now';
  const rowProps = {
    at,
    live: rowLive,
    locale,
    text,
    cityName: city.name.el,
    dutyOnly,
    onToggleFavourite: toggleFavourite,
    onMessage: notify,
  } as const;

  // The chosen pharmacy, from the list on the map (a favourite that is closed is not on it).
  const selectedRow = useMemo(
    () =>
      selectedId === null ? null : (listRows.find((row) => row.pharmacy.id === selectedId) ?? null),
    [selectedId, listRows],
  );
  const mapSelection: MapSelection | null = useMemo(() => {
    if (selectedRow === null) return null;
    const view = describeStatus({
      status: selectedRow.status,
      at,
      live: rowLive,
      locale,
      text: text.status,
      dutyOnly,
    });
    return {
      id: selectedRow.pharmacy.id,
      name: displayName(selectedRow.pharmacy.name),
      when: view.short.timing,
      ripple: selectedOnMap,
    };
  }, [selectedRow, at, rowLive, locale, text, selectedOnMap, dutyOnly]);

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
              dutyOnly={dutyOnly}
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
          {loading && <p className="state">{text.loading}</p>}
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
                  uncovered={uncovered}
                  localities={pickable}
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
                      uncovered={uncovered}
                      localities={pickable}
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
                    canShowClosed={!dutyOnly}
                    showClosed={showClosed}
                    onShowClosed={(value) => {
                      pendingAnnouncement.current = true;
                      setShowClosed(value);
                    }}
                  />
                </div>
              )}

              {timeNotice}
              {dutyOnly && (
                <p className="callout" role="note">
                  {text.summary.dutyOnly}
                </p>
              )}
              {dutyLoading && (
                <p className="state" role="status">
                  {text.time.loadingDuties}
                </p>
              )}
              {!dutyLoading && covered && !covered.duties && (
                <p className="callout" role="note">
                  {online
                    ? timeMode.kind === 'now'
                      ? text.time.dutyNotPublishedToday
                      : text.time.dutyNotPublished
                    : timeMode.kind === 'now'
                      ? text.time.dutyOfflineToday
                      : text.time.dutyOffline}
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
              {covered && !covered.extendedHours && !dutyOnly && (
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
                <>
                  <p className="state">
                    {result.active === 'duty' ? text.list.noDuty : text.list.noneOpen}
                  </p>
                  {nextRows.length > 0 && (
                    <section className="next" aria-labelledby="next-heading">
                      <h2 id="next-heading" className="rows-heading">
                        {dutyOnly ? text.list.dutyNext : text.list.openNext}
                      </h2>
                      <ol className="rows" aria-labelledby="next-heading">
                        {nextRows.map((row) => (
                          <PharmacyRow
                            key={row.pharmacy.id}
                            row={row}
                            selected={row.pharmacy.id === selectedId}
                            expanded={row.pharmacy.id === expandedId}
                            favourite={favourites.ids.includes(row.pharmacy.id)}
                            onToggle={(id) => toggleRow(id, row)}
                            {...rowProps}
                          />
                        ))}
                      </ol>
                    </section>
                  )}
                </>
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
              {favouriteRows.length === 0 && favouritesElsewhere.length === 0 ? (
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
              ) : favouriteRows.length === 0 ? null : (
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
                          sourceName={dutySource}
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
              {favouritesElsewhere.length > 0 && (
                <ul className="elsewhere">
                  {favouritesElsewhere.map(({ city: other, n }) => (
                    <li key={other.id}>
                      <button
                        type="button"
                        className="action"
                        onClick={() => {
                          // An area chosen in this city means nothing in the other one.
                          if (origin?.kind === 'area') {
                            writeItem(AREA_KEY, null);
                            setOrigin(null);
                          }
                          switchCity(other);
                        }}
                      >
                        {fill(
                          n === 1 ? text.favourites.elsewhereOne : text.favourites.elsewhereMany,
                          {
                            city: other.name[locale],
                            n,
                          },
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {frequentRows.length > 0 && (
                <section className="frequent" aria-labelledby="frequent-heading">
                  <h2 id="frequent-heading" className="rows-heading">
                    {text.favourites.frequent}
                  </h2>
                  <ol className="rows" aria-labelledby="frequent-heading">
                    {frequentRows.map((row) => (
                      <PharmacyRow
                        key={row.pharmacy.id}
                        row={row}
                        selected={row.pharmacy.id === selectedId}
                        expanded={row.pharmacy.id === expandedId}
                        favourite={false}
                        onToggle={(rowId) => toggleRow(rowId, row)}
                        {...rowProps}
                      />
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}

          {/* Not while loading: it would sit under the short loading note and then be pushed away. */}
          {!loading && (
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
                  {/* Shown only where the browser can install the app (src/lib/install.ts). */}
                  <li data-install-app>
                    <button type="button" className="link-button">
                      {text.footer.install}
                    </button>
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
        cityId={city.id}
        center={city.center}
        enabled={mapStart.started}
        waiting={ready !== null}
        onWake={wakeMap}
        rows={listRows}
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
        onArea={onMapArea}
        onLocate={() => locate(false, true)}
        locating={geo === 'locating'}
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
