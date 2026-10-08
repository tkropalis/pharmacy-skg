import { createRoot } from 'react-dom/client';
import { cityById } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import HomeApp from '../components/app/HomeApp.tsx';
import { prefetchCityData } from '../components/app/use-city-data.ts';
import type { Dictionary } from '../i18n/index.ts';
import { homeCity } from '../lib/home-city.ts';

/**
 * Mounts the map and list into #app. The Content-Security-Policy allows scripts from 'self'
 * only, so this is a bundled module script and not an Astro island (see report-form.tsx).
 * The server-rendered intro inside #app is the no-JavaScript fallback and is replaced here.
 */
const root = document.getElementById('app');
if (root !== null) {
  // A city's page for today names its city; the home screen opens on the person's own.
  const pageCity = root.dataset.city === undefined ? undefined : cityById(root.dataset.city);
  const city = pageCity ?? homeCity();
  // The requests leave now, not after React has rendered once and run its effects.
  prefetchCityData(city.id);
  const locale: Locale = root.dataset.locale === 'en' ? 'en' : 'el';
  const text = JSON.parse(root.dataset.text ?? '{}') as Dictionary['app'];
  createRoot(root).render(
    <HomeApp
      initialCity={city}
      pageCity={pageCity !== undefined}
      locale={locale}
      text={text}
      title={root.dataset.title ?? ''}
    />,
  );
}
