import { localIsoDate } from '../../lib/dates.ts';

/**
 * The pages are static and know nothing about today, so the element for today's date is
 * marked here, with the date in the city's time zone: it gets aria-current="date" and a
 * "today" badge (the label is in data-today-label, in the page's language).
 */
const today = localIsoDate(new Date());
for (const element of document.querySelectorAll<HTMLElement>('[data-duty-date]')) {
  if (element.dataset['dutyDate'] !== today) continue;
  element.setAttribute('aria-current', 'date');
  const badge = document.createElement('span');
  badge.className = 'seo-badge';
  badge.textContent = element.dataset['todayLabel'] ?? '';
  element.append(badge);
}
