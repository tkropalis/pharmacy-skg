import type { Locale } from '@pharmacy-skg/core';

/**
 * The header's "Medicines" button (SiteHeader.astro; hidden when JavaScript is off). The
 * search's code (React, the dialog, its styles) loads only on the first press; the index of
 * medicines loads when the dialog opens.
 */
export function setupMedicineSearch(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-medicine-search]');
  if (!button) return;
  const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
  button.addEventListener('click', () => {
    button.setAttribute('aria-busy', 'true');
    void import('../components/search/mount.tsx')
      .then(({ openMedicineSearch }) => openMedicineSearch(locale, button))
      .finally(() => button.removeAttribute('aria-busy'));
  });
}
