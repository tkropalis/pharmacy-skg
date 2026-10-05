import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { Locale } from '@pharmacy-skg/core';
import { searchEl } from '../../i18n/search.el.ts';
import { searchEn } from '../../i18n/search.en.ts';
import { MedicineSearch } from './MedicineSearch.tsx';

let root: Root | null = null;
let opened = 0;

/**
 * Opens the medicine search over the page. Loaded on demand by scripts/medicine-search.ts, so
 * no page downloads the search until someone opens it. Each opening starts empty; closing it
 * forgets the query and gives the focus back to the button that opened it.
 */
export function openMedicineSearch(locale: Locale, opener: HTMLElement | null): void {
  if (root === null) {
    const container = document.createElement('div');
    container.id = 'medicine-search';
    document.body.append(container);
    root = createRoot(container);
  }
  const current = root;
  opened += 1;
  current.render(
    <MedicineSearch
      key={opened}
      locale={locale}
      text={locale === 'en' ? searchEn : searchEl}
      onClosed={() => {
        current.render(null);
        opener?.focus();
      }}
    />,
  );
}
