/**
 * Rules for asking for the device position by itself when the home screen opens, and for
 * following it while the page is visible. The last position is kept on the device, rounded
 * (memory.ts), so a later visit can start from it; it never leaves the device.
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
  /**
   * Start from the remembered position and do not ask: the browser would prompt again (Safari
   * forgets an "Allow" after a day, and at every start of an app on the Home Screen). The
   * person can ask for a new position with "Η τοποθεσία μου".
   */
  | 'remembered'
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
  /** A position from an earlier visit is remembered on the device. */
  readonly remembered: boolean;
}

/**
 * Whether to ask for the position when the data is ready. Skipped when the person chose an
 * area or dismissed the position; when the Permissions API says `denied` it is not asked
 * either, and the nearby card explains how to allow it. When the browser has the permission
 * granted, asking shows no prompt, so the position is refreshed by itself. Otherwise a
 * remembered position is used instead of asking (the prompt would come back on every visit),
 * and only a first visit asks.
 */
export function autoLocateDecision(input: AutoLocateInput): AutoLocate {
  if (input.areaChosen || input.dismissed) return 'skip';
  if (input.permission === 'denied') return 'denied';
  if (input.permission === 'granted') return 'locate';
  return input.remembered ? 'remembered' : 'locate';
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
