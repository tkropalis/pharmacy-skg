import { useEffect, useRef, useState } from 'react';
import type { City, Locale } from '@pharmacy-skg/core';
import { cityAt } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import type { Row } from '../../lib/list.ts';
import type { MapController, OriginMark, Selection } from './map-controller.ts';
import { yieldToMain } from '../../lib/idle.ts';
import { importOrOfferReload } from '../../lib/import-or-reload.ts';
import { loadMapStyle } from '../../lib/map-style.ts';
import { offerReload } from '../../lib/update-toast.ts';
import { useMediaQuery } from './use-now.ts';

type MapStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'failed';

/**
 * Moving the map into another covered area shows that area from this zoom in; further out the
 * map shows several areas at once, and the one shown stays.
 */
const AREA_ZOOM = 9;

/** WebGL is required by MapLibre; without it the list is the whole app. */
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface MapFocus {
  readonly id: string;
  /** Changes on every request, so asking for the same pharmacy twice recentres twice. */
  readonly nonce: number;
  /**
   * The height the sheet will cover once it has moved, when the request also moves the sheet
   * (the sheet reports its height only as it goes).
   */
  readonly occluded?: number;
  /** Show the origin with it, however far (the locate button). */
  readonly withOrigin?: boolean;
}

/** The chosen pharmacy; `ripple` when it was chosen on the map itself. */
export interface MapSelection extends Selection {
  readonly ripple: boolean;
}

interface MapViewProps {
  readonly locale: Locale;
  readonly text: Dictionary['app']['map'];
  /** The city shown. */
  readonly cityId: string;
  /** Where the map starts, as [longitude, latitude]: the centre of the city shown. */
  readonly center: readonly [number, number];
  /** Start loading the map (after the list has rendered, see use-map-start.ts). */
  readonly enabled: boolean;
  /** The list is ready and the map is on its way: say so instead of leaving the area blank. */
  readonly waiting: boolean;
  /** The person reached for the map (touch, pointer, keyboard): start it now if it has not. */
  readonly onWake: () => void;
  readonly rows: readonly Row[];
  readonly origin: OriginMark | null;
  /** A new origin to fly to (the nonce changes when the person picked it). */
  readonly originNonce: number;
  readonly selection: MapSelection | null;
  readonly focus: MapFocus | null;
  readonly occludedBottom: number;
  readonly sideBySide: boolean;
  /** The night look: the dark base map. */
  readonly dark: boolean;
  /** The map is covered by the sheet: keep its controls out of the tab order. */
  readonly covered: boolean;
  readonly onSelect: (id: string | null) => void;
  /** The person moved the map themselves. */
  readonly onReach: () => void;
  /** The person moved the map into another covered area: show that one, where the map is. */
  readonly onArea: (city: City) => void;
  /** The locate button on the map. */
  readonly onLocate: () => void;
  /** The position is being asked for: the locate button turns. */
  readonly locating: boolean;
  readonly onStatus: (status: MapStatus) => void;
}

/**
 * The map. MapLibre is loaded with a dynamic import after the list is on screen; if WebGL is
 * missing or the style cannot be fetched the area shows a note and the list carries on.
 */
export function MapView(props: MapViewProps) {
  const { locale, text, enabled, waiting, onWake, sideBySide, dark } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const controller = useRef<MapController | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [status, setStatus] = useState<MapStatus>('idle');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const { onStatus } = props;
  useEffect(() => onStatus(status), [status, onStatus]);

  // The centre of the city shown, once the map has shown it (see below).
  const { center } = props;
  const shownCenter = useRef(center);

  // Create (and re-create when the colour scheme or language changes) the map.
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || container === null) return;
    let cancelled = false;
    setStatus('loading');
    void (async () => {
      try {
        // Each step is its own task, so the page can paint and answer input in between. Creating
        // the first WebGL context alone can take a hundred milliseconds on a phone.
        await yieldToMain();
        if (cancelled) return;
        if (!webglAvailable()) {
          setStatus('unavailable');
          return;
        }
        await yieldToMain();
        if (cancelled) return;
        // The style and the library load side by side.
        const style = loadMapStyle(locale, dark);
        style.catch(() => {});
        // After a deploy this page's chunk may be gone from the cache and the server: the map
        // note says so and the reload notice offers the new version. The list is unaffected.
        const { createMapController } = await importOrOfferReload(
          () => import('./map-controller.ts'),
          offerReload,
        );
        const created = await createMapController(container, {
          locale,
          text,
          style,
          center: latest.current.center,
          // CITY_ZOOM in map-controller.ts, which is loaded only with the map.
          zoom: 12,
          occludedBottom: latest.current.occludedBottom,
          reducedMotion: reducedRef.current,
          sideBySide,
          dark,
          onSelect: (id) => latest.current.onSelect(id),
          onReach: () => latest.current.onReach(),
          onMoved: ([lon, lat], zoom) => {
            if (zoom < AREA_ZOOM) return;
            const here = cityAt({ lat, lon });
            if (here === undefined || here.id === latest.current.cityId) return;
            // The map is already there: it is not moved to the area's centre.
            shownCenter.current = here.center;
            latest.current.onArea(here);
          },
          onLocate: () => latest.current.onLocate(),
        });
        if (cancelled) {
          created.destroy();
          return;
        }
        controller.current = created;
        const now = latest.current;
        created.setRows(now.rows);
        created.setOrigin(now.origin, false, now.occludedBottom);
        created.setSelected(now.selection);
        created.setLocating(now.locating);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
      controller.current?.destroy();
      controller.current = null;
    };
  }, [enabled, locale, text, sideBySide, dark]);

  useEffect(() => {
    if (status === 'ready') controller.current?.setRows(props.rows);
  }, [status, props.rows]);

  const { selection } = props;
  useEffect(() => {
    if (status === 'ready') controller.current?.setSelected(selection, selection?.ripple ?? false);
  }, [status, selection]);

  const { origin, originNonce } = props;
  const lastNonce = useRef(0);
  useEffect(() => {
    if (status !== 'ready') return;
    const fly = originNonce !== lastNonce.current;
    lastNonce.current = originNonce;
    controller.current?.setOrigin(origin, fly, latest.current.occludedBottom);
  }, [status, origin, originNonce]);

  // Another city: show it, unless the origin is in it (the origin's own move shows it then).
  useEffect(() => {
    if (status !== 'ready' || shownCenter.current === center) return;
    shownCenter.current = center;
    const now = latest.current;
    const city = cityAt({ lat: center[1], lon: center[0] });
    if (now.origin === null || cityAt(now.origin) !== city) {
      controller.current?.showCity(center, now.occludedBottom);
    }
  }, [status, center]);

  const { locating } = props;
  useEffect(() => {
    if (status === 'ready') controller.current?.setLocating(locating);
  }, [status, locating]);

  const { focus } = props;
  useEffect(() => {
    if (status === 'ready' && focus !== null) {
      const now = latest.current;
      controller.current?.focusPharmacy(
        focus.id,
        focus.occluded ?? now.occludedBottom,
        now.origin,
        focus.withOrigin,
      );
    }
  }, [status, focus]);

  return (
    <div
      className="map-area"
      inert={props.covered}
      // Anything that shows the person wants the map starts it without waiting for the timer.
      onPointerDown={enabled ? undefined : onWake}
      onPointerMove={enabled ? undefined : onWake}
      onWheel={enabled ? undefined : onWake}
      onFocus={enabled ? undefined : onWake}
      onKeyDown={enabled ? undefined : onWake}
    >
      <div
        ref={containerRef}
        className="map"
        data-status={status}
        // The canvas gets its own accessible label; this wrapper is only a positioning box.
      />
      {(status === 'unavailable' || status === 'failed') && (
        <p className="map-note" role="status">
          {status === 'unavailable' ? text.unavailable : text.loadFailed}
        </p>
      )}
      {(status === 'loading' || (status === 'idle' && waiting)) && (
        <p className="map-note subtle">{text.loading}</p>
      )}
    </div>
  );
}

export type { MapStatus };
