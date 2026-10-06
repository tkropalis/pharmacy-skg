import { useEffect, useId, useState } from 'react';
import type { Dictionary } from '../../i18n/index.ts';
import { Segmented } from './Segmented.tsx';

const CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'auto'];

function current(): ThemeChoice {
  const value = document.documentElement.dataset['themeChoice'];
  return CHOICES.find((choice) => choice === value) ?? 'light';
}

/**
 * Light, dark or auto, in the sheet's footer (the pages have the same in SiteFooter.astro).
 * public/theme.js keeps the choice and applies it; this follows <html data-theme-choice>.
 */
export function ThemeChoice({ text }: { readonly text: Dictionary['app']['footer']['theme'] }) {
  const id = useId();
  const [choice, setChoice] = useState<ThemeChoice>(current);

  useEffect(() => {
    const observer = new MutationObserver(() => setChoice(current()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme-choice'],
    });
    return () => observer.disconnect();
  }, []);

  // Without theme.js (it did not load) there is nothing to switch.
  if (window.pharmacyTheme === undefined) return null;

  return (
    <div className="theme-choice">
      <span id={id} className="theme-choice-label">
        {text.label}
      </span>
      <Segmented
        mode="toggle"
        compact
        labelledBy={id}
        value={choice}
        options={CHOICES.map((value) => ({ id: value, label: text[value] }))}
        onChange={(value) => window.pharmacyTheme?.set(value)}
      />
    </div>
  );
}
