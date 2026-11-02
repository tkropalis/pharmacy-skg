import type { Locale } from '@pharmacy-skg/core';
import { openedWith } from '../lib/shortcuts.ts';

/**
 * The header's "Medicines" button (SiteHeader.astro; hidden when JavaScript is off). The
 * search's code (React, the dialog, its styles) loads only on the first press; the index of
 * medicines loads when the dialog opens.
 */
export function setupMedicineSearch(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-medicine-search]');
  if (!button) return;
  const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
  const open = () => {
    button.setAttribute('aria-busy', 'true');
    void import('../components/search/mount.tsx')
      .then(({ openMedicineSearch }) => openMedicineSearch(locale, button))
      .finally(() => button.removeAttribute('aria-busy'));
  };
  button.addEventListener('click', open);
  // The "Medicines" shortcut on the installed icon opens the search as the app starts.
  if (openedWith === 'medicines') open();
}
