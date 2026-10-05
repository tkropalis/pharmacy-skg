import { pharmacyStatus } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { t } from '../../i18n/index.ts';
import { fill } from '../../lib/seo/format.ts';
import { describeStatus, timeInCity } from '../../lib/seo/status-text.ts';
import { loadNowData } from './now-data.ts';

/**
 * The status on a pharmacy page, right under its name. The page is static and can be old, so the
 * status is worked out here from the data files, with the clock and the city's time zone.
 * Without JavaScript the element stays empty, and hidden (seo.css).
 */

async function show(root: HTMLElement): Promise<void> {
  const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
  const labels = t(locale);
  const id = root.dataset['pharmacyId'] ?? '';

  root.textContent = labels.seo.pharmacy.statusLoading;
  try {
    const now = new Date();
    const { data, failedDates } = await loadNowData(now);
    const { status, dutiesPublished } = pharmacyStatus(data, id, now);
    const text = describeStatus(status, dutiesPublished, now, locale, labels);
    const headline = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = text.short;
    headline.append(strong);
    const detail = document.createElement('p');
    const computed = fill(labels.seo.status.computedAt, { time: timeInCity(now, locale) });
    const failed = failedDates.length > 0 ? ` ${labels.seo.status.loadFailed}` : '';
    detail.textContent = `${text.detail}${failed} ${computed}`;
    root.dataset['tone'] = text.tone;
    root.replaceChildren(headline, detail);
  } catch {
    root.textContent = labels.seo.pharmacy.statusError;
  }
}

const root = document.querySelector<HTMLElement>('[data-pharmacy-status]');
if (root !== null) void show(root);
