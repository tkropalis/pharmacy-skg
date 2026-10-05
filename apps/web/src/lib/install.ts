/**
 * The "Install" buttons (the home screen's sheet footer and the about page). Browsers that can
 * install the app themselves (Chromium) announce it with `beforeinstallprompt`; the event is
 * kept, html[data-installable] is set, and a press on any [data-install-app] button shows the
 * browser's own install dialog. Elsewhere (Safari, Firefox, an app already installed) the
 * attribute is never set and the buttons stay hidden (global.css).
 */
export const INSTALLABLE_ATTRIBUTE = 'data-installable';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

function isInstallPrompt(event: Event): event is BeforeInstallPromptEvent {
  return typeof (event as Partial<BeforeInstallPromptEvent>).prompt === 'function';
}

export function setupInstall(root: HTMLElement = document.documentElement): void {
  let deferred: BeforeInstallPromptEvent | null = null;
  const forget = () => {
    deferred = null;
    root.removeAttribute(INSTALLABLE_ATTRIBUTE);
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isInstallPrompt(event)) return;
    // The browser's own banner would repeat the button; its menu still offers to install.
    event.preventDefault();
    deferred = event;
    root.setAttribute(INSTALLABLE_ATTRIBUTE, '');
  });
  window.addEventListener('appinstalled', forget);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-install-app]') == null || deferred === null) return;
    // The event can show its dialog only once; the browser sends a new one if it is declined.
    const prompt = deferred;
    forget();
    void prompt.prompt().catch(() => {});
  });
}
