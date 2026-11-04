import { faPhone, faStar as faStarSolid } from '@fortawesome/free-solid-svg-icons';
import { faStar } from '@fortawesome/free-regular-svg-icons';
import {
  GREECE_TIME_ZONE,
  cityById,
  hasRegularHours,
  openPharmacies,
  pharmacyStatus,
  zonedDate,
} from '@pharmacy-skg/core';
import type { CityData, Locale, Pharmacy } from '@pharmacy-skg/core';
import { DEFAULT_CITY_ID } from '../../config.ts';
import { t } from '../../i18n/index.ts';
import { directionsTarget, directionsUrl, preferredDirectionsApp } from '../../lib/directions.ts';
import { faSvg } from '../../lib/fa.ts';
import { loadFavourites, saveFavourites, toggleFavourite } from '../../lib/favourites.ts';
import { pinKindOf } from '../../lib/list.ts';
import { openCreditOnHover } from '../../lib/map-credit.ts';
import { recordVisit } from '../../lib/memory.ts';
import { pinSvg } from '../../lib/pins.ts';
import { fill } from '../../lib/seo/format.ts';
import { NEARBY_COUNT, nearbyView } from '../../lib/seo/nearby.ts';
import { closedRowText, describeStatus, timeInCity } from '../../lib/seo/status-text.ts';
import { weekHours } from '../../lib/seo/week-hours.ts';
import { sharePharmacy } from '../../lib/share.ts';
import { MAPS_KEY, readItem } from '../../lib/storage.ts';
import { loadNowData } from './now-data.ts';
import type { MapPin } from './pharmacy-map.ts';

/**
 * The live parts of a pharmacy's page. The page is static and can be old, so whether it is open,
 * the nearest ones open now and the coming days are all worked out here, with the clock and the
 * city's time zone. Without JavaScript the page keeps its neighbours and general hours, and the
 * status box stays hidden (seo.css).
 */

const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
const labels = t(locale);

const element = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The chosen word and marker: the same as the list's, so colour never says it alone. */
function statusLine(text: string, kind: ReturnType<typeof pinKindOf>): HTMLElement {
  const strong = element('strong', 'seo-status-line');
  const mark = element('span', 'seo-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = pinSvg(kind, { size: 18 });
  strong.append(mark, text);
  return strong;
}

function showStatus(root: HTMLElement, data: CityData, id: string, now: Date, failed: boolean) {
  const { status, dutiesPublished } = pharmacyStatus(data, id, now);
  const text = describeStatus(
    status,
    dutiesPublished,
    now,
    locale,
    labels,
    GREECE_TIME_ZONE,
    !hasRegularHours(data.city.id, zonedDate(now, GREECE_TIME_ZONE)),
  );
  const headline = element('p');
  headline.append(statusLine(text.short, pinKindOf(status)));
  const computed = fill(labels.seo.status.computedAt, { time: timeInCity(now, locale) });
  const note = failed ? ` ${labels.seo.status.loadFailed}` : '';
  const detail = element('p', undefined, `${text.detail}${note} ${computed}`);
  root.dataset['tone'] = text.tone;
  root.replaceChildren(headline, detail);
}

function nearRow(
  pharmacy: Pharmacy,
  distance: number | null,
  stateText: string,
  kind: ReturnType<typeof pinKindOf>,
  cityName: string,
): HTMLLIElement {
  const view = nearbyView(pharmacy, distance, locale, cityName, labels.app.row);
  const item = document.createElement('li');
  item.dataset['pharmacyId'] = view.id;
  const text = element('div', 'seo-near-text');
  const name = element('a', 'name', view.name) as HTMLAnchorElement;
  name.href = view.path;
  const state = element('span', 'state');
  state.append(statusLine(stateText, kind));
  const sub = element(
    'span',
    'sub',
    view.distanceText === null ? view.place : `${view.distanceText} · ${view.place}`,
  );
  text.append(name, state, sub);
  item.append(text);
  if (view.phoneHref !== null) {
    const call = element('a', 'seo-call') as HTMLAnchorElement;
    call.href = view.phoneHref;
    call.setAttribute('aria-label', view.callLabel);
    call.innerHTML = faSvg(faPhone);
    item.append(call);
  }
  return item;
}

/**
 * The nearest pharmacies open now take the place of the plain neighbours, however far they are:
 * that is what someone needs when this one is closed. When none is open the neighbours stay,
 * each saying when it opens. Returns them for the map.
 */
function showNearby(data: CityData, pharmacy: Pharmacy, now: Date): MapPin[] {
  const list = document.querySelector<HTMLElement>('[data-near-list]');
  const heading = document.querySelector<HTMLElement>('[data-near-heading]');
  if (list === null || pharmacy.location === null) return [];
  const dutyOnly = !hasRegularHours(data.city.id, zonedDate(now, GREECE_TIME_ZONE));
  const describe = (status: Parameters<typeof describeStatus>[0], published: boolean) =>
    describeStatus(status, published, now, locale, labels, GREECE_TIME_ZONE, dutyOnly);
  const open = openPharmacies(data, now, { origin: pharmacy.location })
    .filter((near) => near.pharmacy.id !== pharmacy.id)
    .slice(0, NEARBY_COUNT);

  if (open.length === 0) {
    for (const row of list.querySelectorAll<HTMLElement>('li[data-pharmacy-id]')) {
      const state = row.querySelector<HTMLElement>('[data-state]');
      const { status, dutiesPublished } = pharmacyStatus(
        data,
        row.dataset['pharmacyId'] ?? '',
        now,
      );
      if (state === null) continue;
      const text =
        status.state === 'closed'
          ? closedRowText(
              status,
              dutiesPublished,
              now,
              locale,
              labels.seo,
              GREECE_TIME_ZONE,
              dutyOnly,
            )
          : describe(status, dutiesPublished).short;
      state.replaceChildren(statusLine(text, pinKindOf(status)));
    }
    return [];
  }

  if (heading !== null) {
    heading.textContent = dutyOnly
      ? labels.seo.pharmacy.nearDutyHeading
      : labels.seo.pharmacy.nearOpenHeading;
  }
  const cityName = cityById(data.city.id)?.name[locale] ?? '';
  list.replaceChildren(
    ...open.map((near) =>
      nearRow(
        near.pharmacy,
        near.distance,
        describe(near.status, near.dutiesPublished).short,
        pinKindOf(near.status),
        cityName,
      ),
    ),
  );
  return open.flatMap(({ pharmacy: near, status }) =>
    near.location === null
      ? []
      : [
          {
            lat: near.location.lat,
            lon: near.location.lon,
            kind: pinKindOf(status),
            approximate: near.location.precision === 'locality',
          },
        ],
  );
}

function showWeek(data: CityData, id: string, now: Date): void {
  const list = document.querySelector<HTMLElement>('[data-week]');
  if (list === null) return;
  const week = weekHours(data, id, now, locale, labels);
  const days = week.filter((day) => !day.unknown);
  // Nothing known for any day: the general hours say to call.
  if (days.length === 0) return;
  list.replaceChildren(
    ...days.map((day) => {
      const item = element('li');
      if (day.today) item.dataset['today'] = 'true';
      if (day.none) item.dataset['none'] = 'true';
      const hours = element('span', 'hours');
      if (day.hours !== '') hours.append(element('span', undefined, day.hours));
      if (day.duty !== null) hours.append(element('span', 'duty', day.duty));
      item.append(element('span', 'day', day.label), hours);
      return item;
    }),
  );
  list.hidden = false;
  if (days.length < week.length) {
    list.after(element('p', 'seo-meta', labels.seo.pharmacy.regularUnknown));
  }
  const general = document.querySelector<HTMLElement>('[data-hours-static]');
  if (general !== null) general.hidden = true;
}

/** The maps app the person uses, instead of the page's default. */
function showDirections(pharmacy: Pharmacy): void {
  const link = document.querySelector<HTMLAnchorElement>('[data-directions]');
  if (link === null) return;
  const app = preferredDirectionsApp(
    readItem(MAPS_KEY),
    navigator.userAgent,
    navigator.maxTouchPoints,
  );
  link.href = directionsUrl(app, directionsTarget(pharmacy));
}

function setupTools(root: HTMLElement, cityId: string, id: string): void {
  const tools = document.querySelector<HTMLElement>('[data-pharmacy-tools]');
  const favourite = tools?.querySelector<HTMLButtonElement>('[data-favourite]');
  const share = tools?.querySelector<HTMLButtonElement>('[data-share]');
  const message = tools?.querySelector<HTMLElement>('[data-tool-message]');
  if (!tools || !favourite || !share || !message) return;
  const row = labels.app.row;
  const name = root.dataset['name'] ?? '';
  const address = root.dataset['address'] ?? '';

  const showFavourite = () => {
    const saved = loadFavourites().some((f) => f.id === id);
    favourite.dataset['saved'] = saved ? 'true' : 'false';
    favourite.setAttribute(
      'aria-label',
      fill(saved ? row.favouriteSavedLabel : row.favouriteLabel, { name }),
    );
    favourite.innerHTML = faSvg(saved ? faStarSolid : faStar);
    favourite.append(element('span', undefined, saved ? row.favouriteSaved : row.favourite));
    return saved;
  };
  showFavourite();
  favourite.addEventListener('click', () => {
    saveFavourites(toggleFavourite(loadFavourites(), { id, cityId }));
    message.textContent = fill(showFavourite() ? row.favouriteAdded : row.favouriteRemoved, {
      name,
    });
  });

  const shareLabel = share.querySelector('span');
  share.addEventListener('click', () => {
    void sharePharmacy(locale, row, name, address, id).then((result) => {
      if (result === null) return;
      message.textContent = result;
      if (shareLabel === null) return;
      shareLabel.textContent = result;
      setTimeout(() => {
        shareLabel.textContent = row.share;
      }, 2500);
    });
  });
  tools.hidden = false;
}

/** The map, once it is near the screen: the library is large, and the page must not wait for it. */
function setupMap(pins: Promise<readonly MapPin[]>, kind: Promise<MapPin['kind']>): void {
  const root = document.querySelector<HTMLElement>('[data-pharmacy-map]');
  const canvas = root?.querySelector<HTMLElement>('[data-map-canvas]');
  if (!root || !canvas) return;
  const credit = root.querySelector<HTMLElement>('.seo-map-credit');
  if (credit !== null) openCreditOnHover(credit);
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  const lat = Number(root.dataset['lat']);
  const lon = Number(root.dataset['lon']);
  const failed = () => {
    root.dataset['state'] = 'failed';
  };
  if (connection?.saveData === true || !('IntersectionObserver' in window)) {
    failed();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void Promise.all([import('./pharmacy-map.ts'), pins, kind])
        .then(([{ showPharmacyMap }, nearby, ownKind]) =>
          showPharmacyMap(canvas, {
            locale,
            lat,
            lon,
            kind: ownKind,
            approximate: root.dataset['approximate'] === 'true',
            pins: nearby,
            onReady: () => {
              root.dataset['state'] = 'ready';
            },
          }),
        )
        .catch(failed);
    },
    { rootMargin: '200px' },
  );
  observer.observe(root);
}

async function show(root: HTMLElement, id: string): Promise<void> {
  const cityId = root.dataset['city'] ?? DEFAULT_CITY_ID;
  root.textContent = labels.seo.pharmacy.statusLoading;

  let givePins: (pins: readonly MapPin[]) => void = () => undefined;
  let giveKind: (kind: MapPin['kind']) => void = () => undefined;
  const pins = new Promise<readonly MapPin[]>((resolve) => {
    givePins = resolve;
  });
  const kind = new Promise<MapPin['kind']>((resolve) => {
    giveKind = resolve;
  });
  setupMap(pins, kind);

  try {
    const now = new Date();
    const { data, failedDates } = await loadNowData(cityId, now);
    const pharmacy = data.pharmacies.find((p) => p.id === id);
    showStatus(root, data, id, now, failedDates.length > 0);
    giveKind(pinKindOf(pharmacyStatus(data, id, now).status));
    if (pharmacy === undefined) {
      givePins([]);
      return;
    }
    showDirections(pharmacy);
    showWeek(data, id, now);
    givePins(showNearby(data, pharmacy, now));
  } catch {
    root.textContent = labels.seo.pharmacy.statusError;
    giveKind('closed');
    givePins([]);
  }
}

const root = document.querySelector<HTMLElement>('[data-pharmacy-status]');
if (root !== null) {
  const id = root.dataset['pharmacyId'] ?? '';
  void show(root, id);
  setupTools(root, root.dataset['city'] ?? DEFAULT_CITY_ID, id);
  // Opening a pharmacy's page counts towards "you open often" (on the device only).
  if (id) recordVisit(id, Date.now());
}
