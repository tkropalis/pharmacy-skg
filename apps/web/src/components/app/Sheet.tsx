import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent,
  MutableRefObject,
  PointerEvent,
  ReactNode,
} from 'react';
import type { Dictionary } from '../../i18n/index.ts';
import { fill } from '../../lib/format.ts';
import { Icon } from './icons.tsx';

export type SheetSize = 'small' | 'medium' | 'large';
const SIZES: readonly SheetSize[] = ['small', 'medium', 'large'];

/** Until the header has been measured: the handle, the tabs and the count. */
const SMALL_FALLBACK_PX = 112;
/** The list comes first on a phone: the default sheet takes most of the screen. */
const MEDIUM_FRACTION = 0.7;
/** On a short screen the default sheet still shows the summary and the first pharmacy. */
const MEDIUM_MIN_PX = 400;
/** The map keeps at least this much of the screen above the default sheet. */
const MEDIUM_MAP_PX = 150;
const LARGE_FRACTION = 0.94;
/** A release faster than this (px/ms) goes on to the next size in its direction. */
const FLICK_SPEED = 0.45;

/**
 * The three snap heights for a map area of this height. `inset` is the room the sheet leaves
 * under its content for the home indicator and the browser's floating toolbar
 * (env(safe-area-inset-bottom)); `smallPx` is what the collapsed sheet shows (the handle and the
 * header, measured). app.css has the same numbers.
 */
export function sheetHeights(
  containerHeight: number,
  inset = 0,
  smallPx = SMALL_FALLBACK_PX,
): Record<SheetSize, number> {
  const small = smallPx + inset;
  const medium = Math.max(
    small + 20,
    Math.min(
      Math.max(Math.round(containerHeight * MEDIUM_FRACTION), MEDIUM_MIN_PX + inset),
      containerHeight - MEDIUM_MAP_PX,
    ),
  );
  return {
    small,
    medium,
    large: Math.max(medium + 20, Math.round(containerHeight * LARGE_FRACTION)),
  };
}

/** The snap point closest to a dragged height. */
export function nearestSize(height: number, heights: Record<SheetSize, number>): SheetSize {
  let best: SheetSize = 'small';
  for (const size of SIZES) {
    if (Math.abs(heights[size] - height) < Math.abs(heights[best] - height)) best = size;
  }
  return best;
}

/**
 * Where a released drag settles: a flick goes on to the next size in its direction (upwards
 * is a positive speed), a slow release to the nearest one.
 */
export function settleSize(
  height: number,
  speed: number,
  heights: Record<SheetSize, number>,
): SheetSize {
  if (Math.abs(speed) >= FLICK_SPEED) {
    const ordered = SIZES.filter((size) =>
      speed > 0 ? heights[size] > height + 1 : heights[size] < height - 1,
    );
    const next = speed > 0 ? ordered[0] : ordered[ordered.length - 1];
    if (next !== undefined) return next;
  }
  return nearestSize(height, heights);
}

/** What the page can ask of the sheet. */
export interface SheetApi {
  /** The height the sheet will have at this size, with what it shows now. */
  heightFor(size: SheetSize): number;
}

interface SheetProps {
  readonly text: Dictionary['app'];
  readonly size: SheetSize;
  readonly onSizeChange: (size: SheetSize) => void;
  /** Desktop: a fixed side panel, no dragging. */
  readonly sidePanel: boolean;
  readonly header: ReactNode;
  readonly children: ReactNode;
  /** The sheet's pixel height is reported so the map can keep the pins above it. */
  readonly onHeight?: (height: number) => void;
  /** The body scrolls back to the top when this changes (a different tab). */
  readonly scrollKey?: string;
  readonly api?: MutableRefObject<SheetApi | null>;
}

interface Drag {
  readonly startY: number;
  readonly startHeight: number;
  moved: boolean;
  /** The last two positions, for the speed at release. */
  lastY: number;
  lastTime: number;
  speed: number;
}

/**
 * A bottom sheet with three snap points on small screens, and a plain side panel from 900px.
 * Drag the handle (a flick goes on to the next size), press it (small → medium → large →
 * medium), use Up/Down on it, or pull the list down from its top to lower the sheet. The
 * collapsed sheet is as tall as what it shows (the handle and the header), measured, so text
 * of any size fits. The size is the only thing that changes when it moves, so it works
 * without animation.
 */
export function Sheet({
  text,
  size,
  onSizeChange,
  sidePanel,
  header,
  children,
  onHeight,
  scrollKey,
  api,
}: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [smallPx, setSmallPx] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  /** The handle and the header as they are now: the collapsed height. */
  const measureSmall = useCallback(
    () =>
      (handleRef.current?.offsetHeight ?? 0) +
      (headerRef.current?.offsetHeight ?? SMALL_FALLBACK_PX),
    [],
  );

  const measure = useCallback((): Record<SheetSize, number> => {
    const container = ref.current?.parentElement?.clientHeight ?? 600;
    // The sheet's bottom padding is env(safe-area-inset-bottom) (zero when there is none).
    const inset = ref.current ? parseFloat(getComputedStyle(ref.current).paddingBottom) || 0 : 0;
    return sheetHeights(container, inset, measureSmall());
  }, [measureSmall]);

  if (api) api.current = { heightFor: (target) => measure()[target] };

  // The collapsed height follows the header (the tabs, or the chosen pharmacy's card).
  useEffect(() => {
    const handle = handleRef.current;
    const head = headerRef.current;
    if (sidePanel || !head) return;
    const update = () => setSmallPx(measureSmall());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    if (handle) observer.observe(handle);
    return () => observer.disconnect();
  }, [sidePanel, measureSmall]);

  // Report the settled height whenever the size or the layout changes.
  useEffect(() => {
    const element = ref.current;
    if (!element || !onHeight) return;
    const report = () => onHeight(sidePanel ? 0 : element.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeight, sidePanel, size]);

  const start = useCallback((y: number) => {
    const height = ref.current?.getBoundingClientRect().height ?? 0;
    drag.current = {
      startY: y,
      startHeight: height,
      moved: false,
      lastY: y,
      lastTime: performance.now(),
      speed: 0,
    };
  }, []);

  const move = useCallback(
    (y: number): boolean => {
      const state = drag.current;
      if (!state) return false;
      const delta = state.startY - y;
      if (Math.abs(delta) > 6) state.moved = true;
      if (!state.moved) return false;
      const now = performance.now();
      const elapsed = now - state.lastTime;
      if (elapsed > 0) {
        // Upwards is positive; smoothed, so one jittery event does not decide a flick.
        state.speed = 0.6 * ((state.lastY - y) / elapsed) + 0.4 * state.speed;
      }
      state.lastY = y;
      state.lastTime = now;
      const heights = measure();
      setDragHeight(Math.min(heights.large, Math.max(heights.small, state.startHeight + delta)));
      return true;
    },
    [measure],
  );

  const end = useCallback(
    (y: number) => {
      const state = drag.current;
      drag.current = null;
      if (!state?.moved) return false;
      const heights = measure();
      const height = Math.min(
        heights.large,
        Math.max(heights.small, state.startHeight + state.startY - y),
      );
      // A pause before letting go is not a flick.
      const speed = performance.now() - state.lastTime > 120 ? 0 : state.speed;
      onSizeChange(settleSize(height, speed, heights));
      setDragHeight(null);
      return true;
    },
    [measure, onSizeChange],
  );

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (sidePanel || event.button !== 0) return;
    start(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    move(event.clientY);
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (end(event.clientY)) suppressClick.current = true;
  }

  // Pulling the list down from its top lowers the sheet, as on iOS. Touch events, not pointer
  // events: the list scrolls natively until it is at the top.
  useEffect(() => {
    const body = bodyRef.current;
    if (sidePanel || !body) return;
    let startY: number | null = null;
    let pulling = false;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      startY = event.touches.length === 1 && touch ? touch.clientY : null;
      pulling = false;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (startY === null || !touch) return;
      if (!pulling) {
        // Only a downward pull that starts with the list at its top.
        if (body.scrollTop > 0 || touch.clientY - startY < 8) return;
        pulling = true;
        start(touch.clientY);
      }
      event.preventDefault();
      move(touch.clientY);
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (pulling && touch) end(touch.clientY);
      startY = null;
      pulling = false;
    };
    body.addEventListener('touchstart', onStart, { passive: true });
    body.addEventListener('touchmove', onMove, { passive: false });
    body.addEventListener('touchend', onEnd);
    body.addEventListener('touchcancel', onEnd);
    return () => {
      body.removeEventListener('touchstart', onStart);
      body.removeEventListener('touchmove', onMove);
      body.removeEventListener('touchend', onEnd);
      body.removeEventListener('touchcancel', onEnd);
    };
  }, [sidePanel, start, move, end]);

  function cycle() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSizeChange(size === 'small' ? 'medium' : size === 'medium' ? 'large' : 'medium');
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = SIZES.indexOf(size);
    if (event.key === 'ArrowUp' && index < SIZES.length - 1) {
      event.preventDefault();
      onSizeChange(SIZES[index + 1] ?? size);
    } else if (event.key === 'ArrowDown' && index > 0) {
      event.preventDefault();
      onSizeChange(SIZES[index - 1] ?? size);
    }
  }

  const style: Record<string, string> = {};
  if (smallPx !== null) style['--sheet-small'] = `${smallPx}px`;
  if (dragHeight !== null) style['height'] = `${dragHeight}px`;

  return (
    <section
      ref={ref}
      className="sheet"
      data-size={size}
      data-dragging={dragHeight === null ? undefined : 'true'}
      style={style as CSSProperties}
      aria-label={text.sheet.label}
    >
      {!sidePanel && (
        <button
          ref={handleRef}
          type="button"
          className="sheet-handle"
          aria-label={fill(text.sheet.handleLabel, { size: text.sheet.sizes[size] })}
          onClick={cycle}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <span className="sheet-grip" aria-hidden="true" />
          <span className="sheet-chevron" data-down={size === 'large'} aria-hidden="true">
            <Icon name="chevron" />
          </span>
        </button>
      )}
      <div className="sheet-header" ref={headerRef}>
        {header}
      </div>
      <div className="sheet-body" tabIndex={-1} ref={bodyRef}>
        {children}
      </div>
    </section>
  );
}
