import {
  GREECE_TIME_ZONE,
  coverage,
  hasRegularHours,
  pharmacyStatus,
  zonedDate,
} from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { DEFAULT_CITY_ID } from '../../config.ts';
import { t } from '../../i18n/index.ts';
import { fill } from '../../lib/seo/format.ts';
import { describeStatus, timeInCity } from '../../lib/seo/status-text.ts';
import { loadNowData } from './now-data.ts';

/**
 * "Open now" on an area page, worked out in the browser at load time: the open pharmacies by
 * name, each with its status ("Εφημερεύει έως 23:00"), then "3 από 109" and when it was checked.
 * Each pharmacy in the full list below is also marked open or closed. Without JavaScript the
 * list is plain and the static duty dates above it still tell the official part.
 */

async function show(root: HTMLElement): Promise<void> {
  const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
  const labels = t(locale);
  const area = labels.seo.area;
  const rows = [...document.querySelectorAll<HTMLElement>('li[data-pharmacy-id]')];

  try {
    const now = new Date();
    const { data, failedDates } = await loadNowData(root.dataset['city'] ?? DEFAULT_CITY_ID, now);
    // The duty day (08:00 to 08:00), not the calendar date: before 08:00 it is yesterday's.
    const dutyDay = coverage(data, now);
    // Without the city's regular hours, a pharmacy not on duty is "not on duty", not closed.
    const dutyOnly = !hasRegularHours(data.city.id, zonedDate(now, GREECE_TIME_ZONE));

    const open: HTMLLIElement[] = [];
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
      if (!dutiesPublished) allPublished = false;
      // One describer for every status: an on-duty pharmacy without printed hours says so
      // (and to call), and a closed one says when the list for its area is missing.
      const text = describeStatus(
        status,
        dutiesPublished,
        now,
        locale,
        labels,
        GREECE_TIME_ZONE,
        dutyOnly,
      );
      if (state !== null) {
        const closed = dutyOnly ? area.notOnDutyNow : area.closedNow;
        state.textContent = isOpen
          ? text.short
          : dutiesPublished
            ? closed
            : `${closed}, ${labels.seo.status.unpublishedShort}`;
      }
      if (isOpen) open.push(openItem(row, text.short));
    }

    const children: HTMLElement[] = [];
    if (open.length > 0) {
      const list = document.createElement('ul');
      list.className = 'seo-list';
      list.append(...open);
      children.push(list);
    }
    const summary =
      open.length === 0
        ? dutyOnly
          ? area.dutyNowNone
          : area.openNowNone
        : fill(dutyOnly ? area.dutyNowSummary : area.openNowSummary, {
            open: open.length,
            total: rows.length,
          });
    const computed = fill(labels.seo.status.computedAt, { time: timeInCity(now, locale) });
    const note = allPublished ? '' : ` ${labels.seo.status.unpublished}`;
    const failed = failedDates.length > 0 ? ` ${labels.seo.status.loadFailed}` : '';
    const paragraph = document.createElement('p');
    paragraph.className = 'seo-meta';
    paragraph.textContent = `${summary} ${computed}${note}${failed}`;
    children.push(paragraph);
    root.dataset['tone'] = open.length > 0 ? 'open' : 'closed';
    root.replaceChildren(...children);
  } catch {
    root.textContent = area.openNowError;
  }
}

/** An open pharmacy: its name, linked like in the full list, and its status. */
function openItem(row: HTMLElement, status: string): HTMLLIElement {
  const item = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'name';
  const link = row.querySelector<HTMLAnchorElement>('.name a');
  if (link !== null) {
    const copy = document.createElement('a');
    copy.href = link.href;
    copy.textContent = link.textContent;
    name.append(copy);
  } else {
    name.textContent = row.querySelector('.name')?.textContent ?? '';
  }
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = status;
  item.append(name, sub);
  return item;
}

const root = document.querySelector<HTMLElement>('[data-area-status]');
if (root !== null) void show(root);
