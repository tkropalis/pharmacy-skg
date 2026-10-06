import { useEffect, useState } from 'react';

/**
 * True while the dark look is on: public/theme.js sets <html data-theme="dark"> before the first
 * paint when the person chose dark in the footer, or auto after sunset or with a dark device,
 * and keeps it up to date. The map follows it (its base map and markers are drawn, not styled
 * by CSS).
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
