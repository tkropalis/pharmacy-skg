/**
 * Whether the device is online, as the browser reports it. `navigator.onLine` can say "online"
 * on a network without internet, but "offline" is reliable, so only that is shown. The state is
 * published as html[data-offline] for the static pages' CSS (the "Offline" marker next to the
 * data's age), and through onConnectionChange for scripts and the home screen.
 */
export const OFFLINE_ATTRIBUTE = 'data-offline';

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Calls `listener` with the new state whenever it changes. Returns the unsubscribe function. */
export function onConnectionChange(listener: (online: boolean) => void): () => void {
  const online = () => listener(true);
  const offline = () => listener(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
}

/** Keeps html[data-offline] in step with the connection (scripts/boot.ts, every page). */
export function markConnection(root: HTMLElement = document.documentElement): void {
  const apply = (online: boolean) => root.toggleAttribute(OFFLINE_ATTRIBUTE, !online);
  apply(isOnline());
  onConnectionChange(apply);
}
