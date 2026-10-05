import { openPharmacies } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { t } from '../../i18n/index.ts';
import { localIsoDate } from '../../lib/dates.ts';
import { fill } from '../../lib/seo/format.ts';
import { describeStatus, timeInCity } from '../../lib/seo/status-text.ts';
import { loadNowData } from './now-data.ts';

/**
 * "Open now" on an area page: marks each listed pharmacy open (with the reason and the closing
 * time) or closed, worked out in the browser at load time. Without JavaScript the list is
 * plain and the static duty dates above it still tell the official part.
 */

async function show(root: HTMLElement): Promise<void> {
  const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
  const labels = t(locale);
  const area = labels.seo.area;
  const rows = [...document.querySelectorAll<HTMLElement>('li[data-pharmacy-id]')];

  try {
    const now = new Date();
    const data = await loadNowData(now);
    const open = new Map(
      openPharmacies(data, now).map((entry) => [entry.pharmacy.id, entry.status]),
    );
    const published = data.duties.has(localIsoDate(now));

    let openCount = 0;
    for (const row of rows) {
      const status = open.get(row.dataset['pharmacyId'] ?? '');
      const state = row.querySelector<HTMLElement>('[data-state]');
      row.dataset['open'] = status === undefined ? 'false' : 'true';
      if (status !== undefined) openCount += 1;
      if (state !== null) {
        state.textContent =
          status === undefined
            ? area.closedNow
            : describeStatus(status, published, now, locale, labels).short;
      }
    }

    const summary = fill(area.openNowSummary, { open: openCount, total: rows.length });
    const computed = fill(labels.seo.status.computedAt, { time: timeInCity(now, locale) });
    const note = published ? '' : ` ${labels.seo.status.unpublished}`;
    const paragraph = document.createElement('p');
    paragraph.textContent = `${summary} ${computed}${note}`;
    root.dataset['tone'] = openCount > 0 ? 'open' : 'closed';
    root.replaceChildren(paragraph);
  } catch {
    root.textContent = area.openNowError;
  }
}

const root = document.querySelector<HTMLElement>('[data-area-status]');
if (root !== null) void show(root);
