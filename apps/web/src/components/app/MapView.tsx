import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import { THESSALONIKI } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import type { Origin, Row } from '../../lib/list.ts';
import type { MapController } from './map-controller.ts';
import { yieldToMain } from '../../lib/idle.ts';
import { importOrOfferReload } from '../../lib/import-or-reload.ts';
import { loadMapStyle } from '../../lib/map-style.ts';
import { offerReload } from '../../lib/update-toast.ts';
import { useMediaQuery } from './use-now.ts';

type MapStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'failed';

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
}

interface MapViewProps {
  readonly locale: Locale;
  readonly text: Dictionary['app']['map'];
  /** Start loading the map (after the list has rendered, see use-map-start.ts). */
  readonly enabled: boolean;
  /** The list is ready and the map is on its way: say so instead of leaving the area blank. */
  readonly waiting: boolean;
  /** The person reached for the map (touch, pointer, keyboard): start it now if it has not. */
  readonly onWake: () => void;
  readonly rows: readonly Row[];
  readonly origin: Origin | null;
  /** A new origin to fly to (the nonce changes when the person picked it). */
  readonly originNonce: number;
  readonly selectedId: string | null;
  readonly focus: MapFocus | null;
  readonly occludedBottom: number;
  readonly sideBySide: boolean;
  /** The map is covered by the sheet: keep its controls out of the tab order. */
  readonly covered: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly onStatus: (status: MapStatus) => void;
}

/**
 * The map. MapLibre is loaded with a dynamic import after the list is on screen; if WebGL is
 * missing or the style cannot be fetched the area shows a note and the list carries on.
 */
export function MapView(props: MapViewProps) {
  const { locale, text, enabled, waiting, onWake, sideBySide } = props;
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
        const style = loadMapStyle(locale);
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
          center: THESSALONIKI.center,
          zoom: 12,
          occludedBottom: latest.current.occludedBottom,
          reducedMotion: reducedRef.current,
          sideBySide,
          onSelect: (id) => latest.current.onSelect(id),
        });
        if (cancelled) {
          created.destroy();
          return;
        }
        controller.current = created;
        const now = latest.current;
        created.setRows(now.rows);
        created.setOrigin(now.origin, false, now.occludedBottom);
        created.setSelected(now.selectedId);
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
  }, [enabled, locale, text, sideBySide]);

  useEffect(() => {
    if (status === 'ready') controller.current?.setRows(props.rows);
  }, [status, props.rows]);

  useEffect(() => {
    if (status === 'ready') controller.current?.setSelected(props.selectedId);
  }, [status, props.selectedId, props.rows]);

  const { origin, originNonce } = props;
  const lastNonce = useRef(0);
  useEffect(() => {
    if (status !== 'ready') return;
    const fly = originNonce !== lastNonce.current;
    lastNonce.current = originNonce;
    controller.current?.setOrigin(origin, fly, latest.current.occludedBottom);
  }, [status, origin, originNonce]);

  const { focus } = props;
  useEffect(() => {
    if (status === 'ready' && focus !== null) {
      controller.current?.focusPharmacy(focus.id, latest.current.occludedBottom);
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
