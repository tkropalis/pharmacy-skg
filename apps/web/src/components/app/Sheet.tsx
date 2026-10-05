import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { Dictionary } from '../../i18n/index.ts';
import { fill } from '../../lib/format.ts';
import { Icon } from './icons.tsx';

export type SheetSize = 'small' | 'medium' | 'large';
const SIZES: readonly SheetSize[] = ['small', 'medium', 'large'];

/** The collapsed sheet shows the handle and the tabs only. */
const SMALL_PX = 120;
const MEDIUM_FRACTION = 0.56;
const LARGE_FRACTION = 0.94;

export function sheetHeights(containerHeight: number): Record<SheetSize, number> {
  return {
    small: SMALL_PX,
    medium: Math.max(SMALL_PX + 80, Math.round(containerHeight * MEDIUM_FRACTION)),
    large: Math.max(SMALL_PX + 160, Math.round(containerHeight * LARGE_FRACTION)),
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
}

/**
 * A bottom sheet with three snap points on small screens (drag the handle, or press it to
 * cycle; Up/Down arrows work on the handle too), and a plain side panel from 900px. The size
 * is also the only thing that changes when it moves, so it works without animation.
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
}: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const measure = useCallback((): Record<SheetSize, number> => {
    const container = ref.current?.parentElement?.clientHeight ?? 600;
    return sheetHeights(container);
  }, []);

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

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (sidePanel || event.button !== 0) return;
    const height = ref.current?.getBoundingClientRect().height ?? 0;
    drag.current = { startY: event.clientY, startHeight: height, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    const delta = state.startY - event.clientY;
    if (Math.abs(delta) > 6) state.moved = true;
    if (!state.moved) return;
    const heights = measure();
    setDragHeight(Math.min(heights.large, Math.max(heights.small, state.startHeight + delta)));
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (state.moved) {
      suppressClick.current = true;
      const heights = measure();
      const end = Math.min(
        heights.large,
        Math.max(heights.small, state.startHeight + state.startY - event.clientY),
      );
      onSizeChange(nearestSize(end, heights));
      setDragHeight(null);
    }
  }

  function cycle() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSizeChange(SIZES[(SIZES.indexOf(size) + 1) % SIZES.length] ?? 'medium');
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

  const style = dragHeight === null ? undefined : { height: `${dragHeight}px` };

  return (
    <section
      ref={ref}
      className="sheet"
      data-size={size}
      data-dragging={dragHeight === null ? undefined : 'true'}
      style={style}
      aria-label={text.sheet.label}
    >
      {!sidePanel && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={fill(text.sheet.handleLabel, { size: text.sheet.sizes[size] })}
          title={text.sheet.dragHint}
          onClick={cycle}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <span className="sheet-grip" aria-hidden="true" />
          <span className={`sheet-chevron${size === 'large' ? ' down' : ''}`} aria-hidden="true">
            <Icon name="chevron" />
          </span>
        </button>
      )}
      <div className="sheet-header">{header}</div>
      <div className="sheet-body" tabIndex={-1} ref={bodyRef}>
        {children}
      </div>
    </section>
  );
}
