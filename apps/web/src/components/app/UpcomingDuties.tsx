import { useState } from 'react';
import type { Locale, Pharmacy, PublishedDuty } from '@pharmacy-skg/core';
import { THESSALONIKI } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { describeDuty } from '../../lib/duties.ts';
import { fill, shortIsoDate } from '../../lib/format.ts';
import { buildIcs, downloadTextFile, dutyEvents } from '../../lib/ics.ts';
import { Icon } from './icons.tsx';

const INITIAL = 4;

interface UpcomingDutiesProps {
  readonly pharmacy: Pharmacy;
  /** Officially published duties from today on, as loaded; never a forecast (D11). */
  readonly duties: readonly PublishedDuty[];
  readonly loading: boolean;
  /** The last date the published lists reach (meta.json), for the empty message. */
  readonly publishedThrough: string | null;
  readonly locale: Locale;
  readonly text: Dictionary['app'];
  readonly now: Date;
  readonly onMessage: (message: string) => void;
}

/** A favourite's published duty dates, with a calendar export. */
export function UpcomingDuties({
  pharmacy,
  duties,
  loading,
  publishedThrough,
  locale,
  text,
  now,
  onMessage,
}: UpcomingDutiesProps) {
  const [all, setAll] = useState(false);
  const shown = all ? duties : duties.slice(0, INITIAL);

  function exportCalendar() {
    const events = dutyEvents(pharmacy, duties, text.ics, THESSALONIKI.timeZone);
    downloadTextFile(
      `pharmacy-${pharmacy.id}-duties.ics`,
      buildIcs(events, now, text.ics.calendarName),
      'text/calendar;charset=utf-8',
    );
    onMessage(text.favourites.calendarSaved);
  }

  return (
    <div className="duties">
      <h3 className="duties-title">{text.favourites.upcoming}</h3>
      {duties.length === 0 ? (
        <p className="hint">
          {loading
            ? text.favourites.loadingDuties
            : publishedThrough === null
              ? text.favourites.noneAnnounced
              : fill(text.favourites.noneUpcoming, {
                  date: shortIsoDate(publishedThrough, locale),
                })}
        </p>
      ) : (
        <>
          <ul className="duties-list">
            {shown.map((duty) => (
              <li key={`${duty.date}-${duty.groupId}-${duty.duty}`}>
                {describeDuty(duty, locale, text)}
              </li>
            ))}
          </ul>
          {duties.length > INITIAL && (
            <button type="button" className="link-button" onClick={() => setAll((v) => !v)}>
              {all
                ? text.favourites.fewerDuties
                : fill(text.favourites.showAllDuties, { n: duties.length })}
            </button>
          )}
          <p>
            <button
              type="button"
              className="action"
              aria-label={fill(text.favourites.addToCalendarLabel, { name: pharmacy.name })}
              onClick={exportCalendar}
            >
              <Icon name="calendar" />
              {text.favourites.addToCalendar}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
