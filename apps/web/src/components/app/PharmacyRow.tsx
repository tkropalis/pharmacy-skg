import { memo, useId } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import { pharmacyPath } from '../../i18n/routes.ts';
import type { Dictionary } from '../../i18n/index.ts';
import {
  DIRECTIONS_APPS,
  directionsTarget,
  directionsUrl,
  preferredDirectionsApp,
  telUrl,
} from '../../lib/directions.ts';
import type { DirectionsApp } from '../../lib/directions.ts';
import { fill, formatDistance } from '../../lib/format.ts';
import type { Row } from '../../lib/list.ts';
import { displayName } from '../../lib/names.ts';
import { pinSvg } from '../../lib/pins.ts';
import { describeStatus } from '../../lib/status-label.ts';
import { MAPS_KEY, readItem, writeItem } from '../../lib/storage.ts';
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
  readonly expanded: boolean;
  readonly favourite: boolean;
  /**
   * The nearest pharmacy open now: the answer, so Call and Directions are labelled buttons
   * under it rather than two circles beside it.
   */
  readonly lead?: boolean;
  /** The city shown: its own name is left out of addresses ("Λάρισα", "Θεσσαλονίκη"). */
  readonly cityName: string;
  readonly onToggle: (id: string) => void;
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

/** The maps app the one-tap button opens (the last one chosen, or the device's own). */
export function directionsApp(): DirectionsApp {
  return preferredDirectionsApp(readItem(MAPS_KEY), navigator.userAgent, navigator.maxTouchPoints);
}

function PharmacyRowView({
  row,
  at,
  live,
  locale,
  text,
  selected,
  expanded,
  favourite,
  lead = false,
  cityName,
  onToggle,
  onToggleFavourite,
  onMessage,
  children,
}: PharmacyRowProps) {
  const { pharmacy } = row;
  const detailsId = useId();
  const view = describeStatus({ status: row.status, at, live, locale, text: text.status });
  const approximate = pharmacy.location?.precision === 'locality';
  const target = directionsTarget(pharmacy);
  const name = displayName(pharmacy.name);
  // The city is the default; other places keep their name.
  const place = [pharmacy.address, pharmacy.locality === cityName ? '' : pharmacy.locality]
    .filter((part) => part !== '')
    .join(', ');
  const call = pharmacy.phone === null ? null : telUrl(pharmacy.phone);
  const directions = directionsUrl(directionsApp(), target);
  const callLabel = fill(text.row.callLabel, { name });
  const directionsLabel = fill(text.row.directionsLabel, { name });

  return (
    <li
      id={`row-${pharmacy.id}`}
      className={lead ? 'row lead' : 'row'}
      data-kind={view.kind}
      data-open={expanded ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="row-main">
        <div className="row-text">
          <h3 className="row-name">
            {/* The whole row opens the details (the button stretches over it, app.css). */}
            <button
              type="button"
              className="row-toggle"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => onToggle(pharmacy.id)}
            >
              {name}
            </button>
          </h3>
          <p className="row-status">
            {/* The map's marker in the label: shape, colour and words say the same. */}
            <strong>
              <span
                className="row-mark"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: pinSvg(view.kind, { approximate, size: 16 }) }}
              />
              {view.short.label}
            </strong>
            {view.short.timing !== null && (
              <span
                className="row-timing"
                data-closing-soon={view.closingSoon ? 'true' : undefined}
              >
                {' '}
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
        {!lead && (
          <div className="row-quick">
            {call !== null && (
              <a className="round call" href={call} aria-label={callLabel}>
                <Icon name="phone" />
              </a>
            )}
            <a
              className="round"
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={directionsLabel}
            >
              <Icon name="directions" />
            </a>
          </div>
        )}
      </div>

      {lead && (
        <div className="lead-actions">
          {call !== null && (
            <a className="big-action primary" href={call} aria-label={callLabel}>
              <Icon name="phone" />
              {text.row.call}
            </a>
          )}
          <a
            className="big-action"
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={directionsLabel}
          >
            <Icon name="directions" />
            {text.row.directions}
          </a>
        </div>
      )}

      {/* Always in the page, so it can open and close smoothly; inert while closed. */}
      <div className="row-details" id={detailsId} data-open={expanded} inert={!expanded}>
        <div className="row-details-inner">
          {pharmacy.phone === null && <p className="row-note">{text.row.noPhone}</p>}
          {approximate && <p className="row-note">{text.row.approximate}</p>}
          {pharmacy.location === null && <p className="row-note">{text.row.noLocation}</p>}
          <div className="row-actions">
            <button
              type="button"
              className="row-action fav"
              data-saved={favourite ? 'true' : undefined}
              // The state is in the name (not aria-pressed), and the name contains the visible text.
              aria-label={fill(favourite ? text.row.favouriteSavedLabel : text.row.favouriteLabel, {
                name,
              })}
              onClick={() => onToggleFavourite(pharmacy.id, name)}
            >
              <span className="row-action-icon">
                <Icon name={favourite ? 'star' : 'starOutline'} size={16} />
              </span>
              {favourite ? text.row.favouriteSaved : text.row.favourite}
            </button>
            <button
              type="button"
              className="row-action"
              aria-label={fill(text.row.shareLabel, { name })}
              onClick={() => {
                void share(locale, text, name, pharmacy.address, pharmacy.id).then(
                  (message) => message !== null && onMessage(message),
                );
              }}
            >
              <span className="row-action-icon">
                <Icon name="share" size={16} />
              </span>
              {text.row.share}
            </button>
            <a className="row-action" href={pharmacyPath(locale, pharmacy.id)}>
              <span className="row-action-icon">
                <Icon name="clock" size={16} />
              </span>
              {text.row.page}
            </a>
          </div>
          {/* Another maps app; the choice is remembered for the one-tap button. */}
          <p className="row-apps">
            <Icon name="directions" size={14} />
            {DIRECTIONS_APPS.map((app) => (
              <a
                key={app}
                className="detail-link"
                href={directionsUrl(app, target)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => writeItem(MAPS_KEY, app)}
              >
                {text.row[app]}
              </a>
            ))}
          </p>
        </div>
      </div>

      {children}
    </li>
  );
}

export const PharmacyRow = memo(PharmacyRowView);
