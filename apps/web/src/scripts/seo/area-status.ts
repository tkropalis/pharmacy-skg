import { coverage, pharmacyStatus } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { t } from '../../i18n/index.ts';
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
    const { data, failedDates } = await loadNowData(now);
    // The duty day (08:00 to 08:00), not the calendar date: before 08:00 it is yesterday's.
    const dutyDay = coverage(data, now);

    let openCount = 0;
    let allPublished = dutyDay.duties && failedDates.length === 0;
    for (const row of rows) {
      const { status, dutiesPublished } = pharmacyStatus(
        data,
        row.dataset['pharmacyId'] ?? '',
        now,
      );
      const isOpen = status.state !== 'closed';
      const state = row.querySelector<HTMLElement>('[data-state]');
      row.dataset['open'] = isOpen ? 'true' : 'false';
      if (isOpen) openCount += 1;
      if (!dutiesPublished) allPublished = false;
      // One describer for every status: an on-duty pharmacy without printed hours says so
      // (and to call), and a closed one says when the list for its area is missing.
      if (state !== null) {
        const text = describeStatus(status, dutiesPublished, now, locale, labels);
        state.textContent = isOpen
          ? text.short
          : dutiesPublished
            ? area.closedNow
            : `${area.closedNow} ${labels.seo.status.unpublishedShort}`;
      }
    }

    const summary = fill(area.openNowSummary, { open: openCount, total: rows.length });
    const computed = fill(labels.seo.status.computedAt, { time: timeInCity(now, locale) });
    const note = allPublished ? '' : ` ${labels.seo.status.unpublished}`;
    const failed = failedDates.length > 0 ? ` ${labels.seo.status.loadFailed}` : '';
    const paragraph = document.createElement('p');
    paragraph.textContent = `${summary} ${computed}${note}${failed}`;
    root.dataset['tone'] = openCount > 0 ? 'open' : 'closed';
    root.replaceChildren(paragraph);
  } catch {
    root.textContent = area.openNowError;
  }
}

const root = document.querySelector<HTMLElement>('[data-area-status]');
if (root !== null) void show(root);
