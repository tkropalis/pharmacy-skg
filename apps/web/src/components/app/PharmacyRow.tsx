import { memo, useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import { localizedPath, pharmacyPath } from '../../i18n/routes.ts';
import type { Dictionary } from '../../i18n/index.ts';
import {
  DIRECTIONS_APPS,
  defaultDirectionsApp,
  directionsTarget,
  directionsUrl,
  telUrl,
} from '../../lib/directions.ts';
import { fill, formatDistance } from '../../lib/format.ts';
import type { Row } from '../../lib/list.ts';
import { pinSvg } from '../../lib/pins.ts';
import { describeStatus } from '../../lib/status-label.ts';
import { Icon } from './icons.tsx';

type Text = Dictionary['app'];

export interface PharmacyRowProps {
  readonly row: Row;
  readonly at: Date;
  /** True when `at` is the current time, so a countdown makes sense. */
  readonly live: boolean;
  readonly locale: Locale;
  readonly text: Text;
  readonly selected: boolean;
  readonly favourite: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggleFavourite: (id: string, name: string) => void;
  readonly onMessage: (message: string) => void;
  readonly children?: ReactNode;
}

/** An absolute link to the pharmacy's own page, for sharing. */
function pageUrl(locale: Locale, id: string): string {
  return new URL(pharmacyPath(locale, id), window.location.origin).href;
}

async function share(
  locale: Locale,
  text: Text,
  name: string,
  address: string,
  id: string,
): Promise<string | null> {
  const url = pageUrl(locale, id);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: name,
        text: fill(text.row.shareText, { name, address }),
        url,
      });
      return null;
    } catch (error) {
      // Closing the share sheet is not an error.
      if (error instanceof DOMException && error.name === 'AbortError') return null;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return text.row.copied;
  } catch {
    return text.row.copyFailed;
  }
}

function PharmacyRowView({
  row,
  at,
  live,
  locale,
  text,
  selected,
  favourite,
  onSelect,
  onToggleFavourite,
  onMessage,
  children,
}: PharmacyRowProps) {
  const { pharmacy } = row;
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const view = describeStatus({ status: row.status, at, live, locale, text: text.status });
  const approximate = pharmacy.location?.precision === 'locality';
  const target = directionsTarget(pharmacy);
  // The city is the default; other places keep their name.
  const place = [
    pharmacy.address,
    pharmacy.locality === text.row.defaultLocality ? '' : pharmacy.locality,
  ]
    .filter((part) => part !== '')
    .join(', ');

  return (
    <li
      id={`row-${pharmacy.id}`}
      className="row"
      data-kind={view.kind}
      data-open={open ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="row-main">
        <span
          className="row-pin"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: pinSvg(view.kind, { approximate, size: 24 }) }}
        />
        <div className="row-text">
          <h2 className="row-name">
            {/* The whole row opens the details (the button stretches over it, app.css). */}
            <button
              type="button"
              className="row-toggle"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => {
                setOpen((value) => !value);
                if (!open && pharmacy.location !== null) onSelect(pharmacy.id);
              }}
            >
              {pharmacy.name}
            </button>
          </h2>
          <p className="row-status">
            <strong>{view.short.label}</strong>
            {view.short.timing !== null && (
              <span
                className="row-timing"
                data-closing-soon={view.closingSoon ? 'true' : undefined}
              >
                {' · '}
                {view.short.timing}
              </span>
            )}
          </p>
          <p className="row-address">
            {row.distance !== null && (
              <span className="row-distance">{formatDistance(row.distance, locale)}</span>
            )}
            {row.distance !== null && place !== '' && ' · '}
            {place}
          </p>
          {!row.dutiesPublished && (
            <p className="row-warning" role="note">
              {text.row.dutiesMissing}
            </p>
          )}
        </div>
        <div className="row-quick">
          {pharmacy.phone !== null && (
            <a
              className="round call"
              href={telUrl(pharmacy.phone)}
              aria-label={fill(text.row.callLabel, { name: pharmacy.name })}
            >
              <Icon name="phone" />
            </a>
          )}
          <a
            className="round"
            href={directionsUrl(
              defaultDirectionsApp(navigator.userAgent, navigator.maxTouchPoints),
              target,
            )}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={fill(text.row.directionsLabel, { name: pharmacy.name })}
          >
            <Icon name="directions" />
          </a>
        </div>
      </div>

      {open && (
        <div className="row-details" id={detailsId}>
          <p className="row-full">{view.label}</p>
          {pharmacy.phone === null && <p className="row-note">{text.row.noPhone}</p>}
          {approximate && <p className="row-note">{text.row.approximate}</p>}
          {pharmacy.location === null && <p className="row-note">{text.row.noLocation}</p>}
          <p className="row-menu">
            <span className="row-menu-label">{text.row.directionsTo}</span>
            {DIRECTIONS_APPS.map((app) => (
              <a
                key={app}
                className="detail-link"
                href={directionsUrl(app, target)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {text.row[app]}
              </a>
            ))}
          </p>
          <p className="row-menu">
            <button
              type="button"
              className="detail-link fav"
              data-saved={favourite ? 'true' : undefined}
              // The state is in the name (not aria-pressed), and the name contains the visible text.
              aria-label={fill(favourite ? text.row.favouriteSavedLabel : text.row.favouriteLabel, {
                name: pharmacy.name,
              })}
              onClick={() => onToggleFavourite(pharmacy.id, pharmacy.name)}
            >
              <Icon name={favourite ? 'star' : 'starOutline'} size={16} />
              {favourite ? text.row.favouriteSaved : text.row.favourite}
            </button>
            <button
              type="button"
              className="detail-link"
              aria-label={fill(text.row.shareLabel, { name: pharmacy.name })}
              onClick={() => {
                void share(locale, text, pharmacy.name, pharmacy.address, pharmacy.id).then(
                  (message) => message !== null && onMessage(message),
                );
              }}
            >
              <Icon name="share" size={16} />
              {text.row.share}
            </button>
            <a className="detail-link" href={pharmacyPath(locale, pharmacy.id)}>
              {text.row.page}
            </a>
            <a
              className="detail-link"
              href={`${localizedPath(locale, 'report')}?pharmacy=${encodeURIComponent(pharmacy.id)}`}
              aria-label={fill(text.row.reportLabel, { name: pharmacy.name })}
            >
              <Icon name="flag" size={16} />
              {text.row.report}
            </a>
          </p>
        </div>
      )}

      {children}
    </li>
  );
}

export const PharmacyRow = memo(PharmacyRowView);
