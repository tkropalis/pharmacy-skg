import { useEffect, useState } from 'react';

/**
 * True while the night look is on: public/theme.js sets <html data-theme="dark"> before the
 * first paint, after sunset in Thessaloniki or when the device asks for dark, and keeps it up
 * to date. The map follows it (its base map and markers are drawn, not styled by CSS).
 */
export function useNightLook(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.dataset['theme'] === 'dark');
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.dataset['theme'] === 'dark');
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
