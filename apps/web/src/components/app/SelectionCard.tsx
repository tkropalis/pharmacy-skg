import { useEffect, useRef } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { directionsTarget, directionsUrl, telUrl } from '../../lib/directions.ts';
import { fill, formatDistance } from '../../lib/format.ts';
import type { Row } from '../../lib/list.ts';
import { displayName } from '../../lib/names.ts';
import { pinSvg } from '../../lib/pins.ts';
import { describeStatus } from '../../lib/status-label.ts';
import { Icon } from './icons.tsx';
import { directionsApp } from './PharmacyRow.tsx';

interface SelectionCardProps {
  readonly row: Row;
  readonly at: Date;
  readonly live: boolean;
  readonly locale: Locale;
  readonly text: Dictionary['app'];
  readonly onClose: () => void;
}

/**
 * The pharmacy chosen on the map, in the lowered sheet (a phone): its name, its status and two
 * big buttons, Call and Directions, right under the map. Pulling the sheet up opens the list at
 * its row; the cross, a tap on the map or Escape lets it go.
 */
export function SelectionCard({ row, at, live, locale, text, onClose }: SelectionCardProps) {
  const { pharmacy } = row;
  const name = displayName(pharmacy.name);
  const view = describeStatus({ status: row.status, at, live, locale, text: text.status });
  const approximate = pharmacy.location?.precision === 'locality';
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Keyboard and screen-reader users land on the card (a tap on the map is announced too).
  useEffect(() => {
    if (document.activeElement === document.body) titleRef.current?.focus({ preventScroll: true });
  }, [pharmacy.id]);

  return (
    <div className="peek" data-kind={view.kind}>
      <div className="peek-head">
        <div className="peek-text">
          <h2 className="peek-name" ref={titleRef} tabIndex={-1}>
            {name}
          </h2>
          <p className="row-status">
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
            {row.distance !== null && (
              <span className="row-distance"> · {formatDistance(row.distance, locale)}</span>
            )}
          </p>
        </div>
        <button type="button" className="peek-close" aria-label={text.close} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="lead-actions">
        {pharmacy.phone !== null && (
          <a
            className="big-action primary"
            href={telUrl(pharmacy.phone)}
            aria-label={fill(text.row.callLabel, { name })}
          >
            <Icon name="phone" />
            {text.row.call}
          </a>
        )}
        <a
          className="big-action"
          href={directionsUrl(directionsApp(), directionsTarget(pharmacy))}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={fill(text.row.directionsLabel, { name })}
        >
          <Icon name="directions" />
          {text.row.directions}
        </a>
      </div>
    </div>
  );
}
