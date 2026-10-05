/**
 * Rules for asking for the device position by itself when the home screen opens, and for
 * following it while the page is visible. Only flags are ever stored (storage.ts), never a
 * position, and the position never leaves the device.
 */

export type PermissionResult = 'granted' | 'denied' | 'prompt' | 'unknown';

/** The Permissions API's answer, or 'unknown' where it is missing or fails (older Safari). */
export async function geolocationPermission(): Promise<PermissionResult> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export type AutoLocate =
  /** Ask for the position now (the browser shows its own prompt on the first visit). */
  | 'locate'
  /** The browser has the permission blocked: do not ask, say how to allow it. */
  | 'denied'
  /** Do not ask: the person chose an area, or turned the request off. */
  | 'skip';

export interface AutoLocateInput {
  /** The person turned the automatic request off (cleared the position). */
  readonly dismissed: boolean;
  /** The person explicitly chose an area (remembered). */
  readonly areaChosen: boolean;
  readonly permission: PermissionResult;
}

/**
 * Whether to ask for the position when the data is ready. Skipped when the person chose an
 * area or dismissed the position; when the Permissions API says `denied` it is not asked
 * either, and the nearby card explains how to allow it.
 */
export function autoLocateDecision(input: AutoLocateInput): AutoLocate {
  if (input.areaChosen || input.dismissed) return 'skip';
  if (input.permission === 'denied') return 'denied';
  return 'locate';
}

/** A move smaller than this does not re-sort the list while following the position. */
export const WATCH_MOVE_METRES = 50;

/** Options of the one-off request on load: a cached position up to five minutes old will do. */
export const FIRST_FIX_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

/** Options of the follow-up watch while the page is visible. */
export const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 60_000,
  maximumAge: 30_000,
};
