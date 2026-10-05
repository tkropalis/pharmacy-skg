import { memo, useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import { localizedPath, pharmacyPath } from '../../i18n/routes.ts';
import type { Dictionary } from '../../i18n/index.ts';
import { DIRECTIONS_APPS, directionsTarget, directionsUrl, telUrl } from '../../lib/directions.ts';
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
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const view = describeStatus({ status: row.status, at, live, locale, text: text.status });
  const approximate = pharmacy.location?.precision === 'locality';
  const target = directionsTarget(pharmacy);

  return (
    <li
      id={`row-${pharmacy.id}`}
      className="row"
      data-kind={view.kind}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="row-head">
        <span
          className="row-pin"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: pinSvg(view.kind, { approximate, size: 28 }) }}
        />
        <h2 className="row-name">
          <a href={pharmacyPath(locale, pharmacy.id)}>{pharmacy.name}</a>
        </h2>
        {row.distance !== null && (
          <span className="row-distance">{formatDistance(row.distance, locale)}</span>
        )}
      </div>

      <p className="row-status">
        <strong>{view.label}</strong>
        {view.dutyKinds !== null && <span>{` · ${view.dutyKinds}`}</span>}
      </p>
      {!row.dutiesPublished && (
        <p className="row-warning" role="note">
          {text.row.dutiesMissing}
        </p>
      )}
      {(view.timing !== null || view.closingSoon) && (
        <p className="row-timing" data-closing-soon={view.closingSoon ? 'true' : undefined}>
          {view.closingSoon && <span className="badge">{text.status.closingSoon}</span>}
          {view.closingSoon && view.timing !== null ? ' ' : ''}
          {view.timing !== null && <span>{view.timing}</span>}
        </p>
      )}

      <p className="row-address">
        {[pharmacy.address, pharmacy.locality].filter((s) => s !== '').join(', ')}
        {approximate && <span className="row-note">{text.row.approximate}</span>}
        {pharmacy.location === null && <span className="row-note">{text.row.noLocation}</span>}
      </p>

      <div className="row-actions">
        {pharmacy.phone !== null ? (
          <a
            className="action primary"
            href={telUrl(pharmacy.phone)}
            aria-label={fill(text.row.callLabel, { name: pharmacy.name })}
          >
            <Icon name="phone" />
            {text.row.call}
          </a>
        ) : (
          <span className="action disabled">{text.row.noPhone}</span>
        )}
        <button
          type="button"
          className="action"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={fill(text.row.directionsLabel, { name: pharmacy.name })}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name="directions" />
          {text.row.directions}
        </button>
        <button
          type="button"
          className="action"
          aria-label={fill(text.row.shareLabel, { name: pharmacy.name })}
          onClick={() => {
            void share(locale, text, pharmacy.name, pharmacy.address, pharmacy.id).then(
              (message) => message !== null && onMessage(message),
            );
          }}
        >
          <Icon name="share" />
          {text.row.share}
        </button>
        <button
          type="button"
          className="action fav"
          data-saved={favourite ? 'true' : undefined}
          // The state is in the name (not aria-pressed), and the name contains the visible text.
          aria-label={fill(favourite ? text.row.favouriteSavedLabel : text.row.favouriteLabel, {
            name: pharmacy.name,
          })}
          onClick={() => onToggleFavourite(pharmacy.id, pharmacy.name)}
        >
          <Icon name={favourite ? 'star' : 'starOutline'} />
          {favourite ? text.row.favouriteSaved : text.row.favourite}
        </button>
      </div>

      {menuOpen && (
        <p className="row-menu" id={menuId}>
          <span>{text.row.directionsTo}</span>
          {DIRECTIONS_APPS.map((app) => (
            <a
              key={app}
              className="action small"
              href={directionsUrl(app, target)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {text.row[app]}
            </a>
          ))}
        </p>
      )}

      {children}

      <p className="row-links">
        {pharmacy.location !== null && (
          <button type="button" className="link-button" onClick={() => onSelect(pharmacy.id)}>
            <Icon name="map" />
            {text.row.showOnMap}
          </button>
        )}
        <a
          className="link-button"
          href={`${localizedPath(locale, 'report')}?pharmacy=${encodeURIComponent(pharmacy.id)}`}
          aria-label={fill(text.row.reportLabel, { name: pharmacy.name })}
        >
          <Icon name="flag" />
          {text.row.report}
        </a>
      </p>
    </li>
  );
}

export const PharmacyRow = memo(PharmacyRowView);
