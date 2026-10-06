import { useState } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { localizedPath } from '../../i18n/routes.ts';
import { fill } from '../../lib/format.ts';
import { closedReportMessage, reportFormSearch, sendReport } from '../../lib/report.ts';

type Text = Dictionary['app'];

interface ClosedReportProps {
  readonly pharmacyId: string;
  /** The pharmacy's name as shown, for the accessible names. */
  readonly name: string;
  /** What the row said when the person found it closed ("Εφημερεύει έως 08:00"). */
  readonly shown: string;
  readonly at: Date;
  readonly locale: Locale;
  readonly text: Text;
  /** Says the outcome through the live region (and the toast). */
  readonly onMessage: (message: string) => void;
}

type State = 'idle' | 'confirm' | 'sending' | 'sent' | 'unavailable' | 'network';

/**
 * "Το βρήκα κλειστό": a pharmacy the app shows as open, found closed. The most common complaint
 * about every duty app is exactly this, so it takes two taps (the second confirms, as the
 * report is public) instead of the whole form. The report says when and what the app showed;
 * nothing else, and never the person's position (decision D17).
 */
export function ClosedReport({
  pharmacyId,
  name,
  shown,
  at,
  locale,
  text,
  onMessage,
}: ClosedReportProps) {
  const [state, setState] = useState<State>('idle');
  const t = text.closedReport;

  async function send() {
    setState('sending');
    const result = await sendReport(
      {
        pharmacy: pharmacyId,
        type: 'closed-but-listed-open',
        message: closedReportMessage(at, shown),
      },
      locale,
    );
    if (result.kind === 'sent') {
      setState('sent');
      onMessage(t.sent);
    } else {
      const failed = result.kind === 'network' ? 'network' : 'unavailable';
      setState(failed);
      onMessage(failed === 'network' ? `${t.failed} ${t.checkConnection}` : t.failed);
    }
  }

  switch (state) {
    case 'idle':
      return (
        <p className="closed-report">
          <button
            type="button"
            className="detail-link"
            aria-label={fill(t.buttonLabel, { name })}
            onClick={() => setState('confirm')}
          >
            {t.button}
          </button>
        </p>
      );
    case 'confirm':
    case 'sending':
      return (
        <div className="closed-report" role="group" aria-label={fill(t.buttonLabel, { name })}>
          <p>{t.confirm}</p>
          <div className="closed-report-actions">
            <button
              type="button"
              className="action primary"
              disabled={state === 'sending'}
              onClick={() => void send()}
            >
              {t.send}
            </button>
            <button
              type="button"
              className="action"
              disabled={state === 'sending'}
              onClick={() => setState('idle')}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      );
    case 'sent':
      return <p className="closed-report">{t.sent}</p>;
    case 'unavailable':
    case 'network':
      return (
        <p className="closed-report">
          {state === 'network' ? `${t.failed} ${t.checkConnection}` : t.failed}{' '}
          <a
            className="detail-link"
            href={`${localizedPath(locale, 'report')}${reportFormSearch(pharmacyId, 'closed-but-listed-open')}`}
          >
            {t.form}
          </a>
        </p>
      );
  }
}
