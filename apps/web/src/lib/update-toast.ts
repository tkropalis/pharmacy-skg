/**
 * The "new version" notice. The page is never reloaded under someone who is looking at it (they
 * may be reading a phone number or about to call): a small notice offers a reload button and can
 * be dismissed. The texts come from the page (data attributes on <body>, set in the layout).
 *
 * While the notice shows, `html.has-update-toast` is set and `--update-toast-space` holds the
 * room it takes at the bottom of the screen, so the sheet and the page end above it instead of
 * under it (see global.css and app.css).
 */
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { faSvg } from './fa.ts';

const REGION_CLASS = 'update-region';
const TOAST_CLASS = 'update-toast';
const SPACE_PROPERTY = '--update-toast-space';
const ACTIVE_CLASS = 'has-update-toast';

let resizeObserver: ResizeObserver | null = null;

/**
 * The live region the notice is put into. It exists, empty, from the page's start: a screen
 * reader only announces text that is inserted into a region it already knows about.
 */
export function ensureUpdateRegion(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`.${REGION_CLASS}`);
  if (existing !== null) return existing;
  const region = document.createElement('div');
  region.className = REGION_CLASS;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.append(region);
  return region;
}

function clearSpace(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  document.documentElement.classList.remove(ACTIVE_CLASS);
  document.documentElement.style.removeProperty(SPACE_PROPERTY);
}

/** Reserves the room under the notice, and keeps it right when the notice wraps or the text grows. */
function reserveSpace(toast: HTMLElement): void {
  const root = document.documentElement;
  const publish = () => {
    // The notice's height plus the gap it sits above the screen's edge (and the home indicator).
    const { height } = toast.getBoundingClientRect();
    root.style.setProperty(
      SPACE_PROPERTY,
      `calc(${Math.ceil(height)}px + 1.5rem + env(safe-area-inset-bottom, 0px))`,
    );
  };
  root.classList.add(ACTIVE_CLASS);
  publish();
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(publish);
    resizeObserver.observe(toast);
  }
}

/** Takes the notice away (and the room it reserved). */
export function dismissUpdateToast(): void {
  const toast = document.querySelector(`.${TOAST_CLASS}`);
  // Keyboard and screen-reader users would otherwise be dropped on <body>.
  const hadFocus = toast?.contains(document.activeElement) ?? false;
  toast?.remove();
  clearSpace();
  if (hadFocus) document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true });
}

/**
 * Shows the notice with its reload button. Does nothing if it is already showing or the page
 * carries no texts for it.
 */
export function offerReload(): void {
  if (document.querySelector(`.${TOAST_CLASS}`) !== null) return;
  const { updateAvailable, updateReload, updateDismiss } = document.body.dataset;
  if (!updateAvailable || !updateReload || !updateDismiss) return;

  const toast = document.createElement('div');
  toast.className = TOAST_CLASS;

  const message = document.createElement('span');
  message.className = 'update-message';
  message.textContent = updateAvailable;

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'button';
  reload.textContent = updateReload;
  reload.addEventListener('click', () => window.location.reload());

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'update-dismiss';
  dismiss.setAttribute('aria-label', updateDismiss);
  dismiss.innerHTML = faSvg(faXmark, { size: 18 });
  dismiss.addEventListener('click', dismissUpdateToast);

  toast.append(message, reload, dismiss);
  // Inserted into the live region that was in the page before: that is what gets it announced.
  ensureUpdateRegion().append(toast);
  reserveSpace(toast);
}
