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
  const moreId = useId();
  const [menu, setMenu] = useState<'directions' | 'more' | null>(null);
  const view = describeStatus({ status: row.status, at, live, locale, text: text.status });
  const approximate = pharmacy.location?.precision === 'locality';
  const target = directionsTarget(pharmacy);
  const toggle = (which: 'directions' | 'more') =>
    setMenu((open) => (open === which ? null : which));

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
          dangerouslySetInnerHTML={{ __html: pinSvg(view.kind, { approximate, size: 22 }) }}
        />
        <h2 className="row-name">
          <a href={pharmacyPath(locale, pharmacy.id)}>{pharmacy.name}</a>
        </h2>
        {row.distance !== null && (
          <span className="row-distance">{formatDistance(row.distance, locale)}</span>
        )}
      </div>

      <div className="row-body">
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
              <Icon name="phone" size={18} />
              {text.row.call}
            </a>
          ) : (
            <span className="action disabled">{text.row.noPhone}</span>
          )}
          <button
            type="button"
            className="action"
            aria-expanded={menu === 'directions'}
            aria-controls={menuId}
            aria-label={fill(text.row.directionsLabel, { name: pharmacy.name })}
            onClick={() => toggle('directions')}
          >
            <Icon name="directions" size={18} />
            {text.row.directions}
          </button>
          <span className="row-tools">
            {pharmacy.location !== null && (
              <button
                type="button"
                className="action icon-only"
                aria-label={text.row.showOnMap}
                title={text.row.showOnMap}
                onClick={() => onSelect(pharmacy.id)}
              >
                <Icon name="map" />
              </button>
            )}
            <button
              type="button"
              className="action icon-only fav"
              data-saved={favourite ? 'true' : undefined}
              // The state is in the name (not aria-pressed).
              aria-label={fill(favourite ? text.row.favouriteSavedLabel : text.row.favouriteLabel, {
                name: pharmacy.name,
              })}
              title={favourite ? text.row.favouriteSaved : text.row.favourite}
              onClick={() => onToggleFavourite(pharmacy.id, pharmacy.name)}
            >
              <Icon name={favourite ? 'star' : 'starOutline'} />
            </button>
            <button
              type="button"
              className="action icon-only"
              aria-expanded={menu === 'more'}
              aria-controls={moreId}
              aria-label={fill(text.row.moreLabel, { name: pharmacy.name })}
              title={text.row.more}
              onClick={() => toggle('more')}
            >
              <Icon name="more" />
            </button>
          </span>
        </div>

        {menu === 'directions' && (
          <p className="row-menu" id={menuId}>
            <span className="row-menu-label">{text.row.directionsTo}</span>
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
        {menu === 'more' && (
          <p className="row-menu" id={moreId}>
            <button
              type="button"
              className="action small"
              aria-label={fill(text.row.shareLabel, { name: pharmacy.name })}
              onClick={() => {
                void share(locale, text, pharmacy.name, pharmacy.address, pharmacy.id).then(
                  (message) => message !== null && onMessage(message),
                );
              }}
            >
              <Icon name="share" size={18} />
              {text.row.share}
            </button>
            <a
              className="action small"
              href={`${localizedPath(locale, 'report')}?pharmacy=${encodeURIComponent(pharmacy.id)}`}
              aria-label={fill(text.row.reportLabel, { name: pharmacy.name })}
            >
              <Icon name="flag" size={18} />
              {text.row.report}
            </a>
          </p>
        )}

        {children}
      </div>
    </li>
  );
}

export const PharmacyRow = memo(PharmacyRowView);
