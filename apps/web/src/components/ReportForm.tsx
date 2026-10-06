import { useEffect, useId, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { Locale } from '@pharmacy-skg/core';
import type { Dictionary } from '../i18n/index.ts';
import {
  MESSAGE_MAX,
  PHARMACY_MAX,
  REPORT_TYPES,
  fallbackIssueUrl,
  isReportType,
  pharmacyFromSearch,
  sendReport,
  typeFromSearch,
} from '../lib/report.ts';
import type { ReportType } from '../lib/report.ts';
import './report-form.css';

interface Props {
  labels: Dictionary['report']['form'];
  locale: Locale;
}

type Failure = 'validation' | 'unavailable' | 'network';
type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent'; readonly issueUrl: string | null }
  | { readonly kind: 'error'; readonly failure: Failure };

/** Sends a problem report to /api/report (decision D17); on failure offers a GitHub link. */
export default function ReportForm({ labels, locale }: Props) {
  const id = useId();
  const [pharmacy, setPharmacy] = useState('');
  const [type, setType] = useState<ReportType>('wrong-hours');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot: people leave it empty
  const [state, setState] = useState<State>({ kind: 'idle' });

  // `?pharmacy=<id>&type=<type>` prefill the form. Read after hydration so server and client
  // HTML match.
  useEffect(() => {
    const fromUrl = pharmacyFromSearch(window.location.search);
    if (fromUrl !== '') setPharmacy(fromUrl);
    const typeFromUrl = typeFromSearch(window.location.search);
    if (typeFromUrl !== null) setType(typeFromUrl);
  }, []);

  const dirty = message !== '' || (pharmacy !== '' && state.kind !== 'sent');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === 'sending') return;
    if (message.trim().length < 3) {
      setState({ kind: 'error', failure: 'validation' });
      return;
    }
    setState({ kind: 'sending' });
    const result = await sendReport({ pharmacy, type, message, website }, locale);
    switch (result.kind) {
      case 'sent':
        setState({ kind: 'sent', issueUrl: result.issueUrl });
        setMessage('');
        return;
      case 'invalid':
        setState({ kind: 'error', failure: 'validation' });
        return;
      case 'unavailable':
      case 'network':
        setState({ kind: 'error', failure: result.kind });
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="callout" role="status">
        <p>
          <strong>{labels.successTitle}</strong> {labels.successBody}
        </p>
        {state.issueUrl !== null && state.issueUrl.startsWith('https://github.com/') && (
          <p>
            <a href={state.issueUrl} rel="noopener">
              {labels.viewIssue}
            </a>
          </p>
        )}
        <p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setState({ kind: 'idle' })}
          >
            {labels.sendAnother}
          </button>
        </p>
      </div>
    );
  }

  const sending = state.kind === 'sending';
  const fallback = fallbackIssueUrl(
    { pharmacy, type, message },
    labels.typeOptions[type],
    labels.issueTitlePrefix,
    labels.issueNoPharmacy,
  );

  return (
    <form
      className="report-form"
      onSubmit={(e) => void submit(e)}
      data-dirty={dirty ? 'true' : 'false'}
      aria-busy={sending}
    >
      <div className="field">
        <label htmlFor={`${id}-pharmacy`}>{labels.pharmacyLabel}</label>
        <input
          id={`${id}-pharmacy`}
          name="pharmacy"
          type="text"
          maxLength={PHARMACY_MAX}
          autoComplete="off"
          aria-describedby={`${id}-pharmacy-hint`}
          value={pharmacy}
          onChange={(e) => setPharmacy(e.target.value)}
        />
        <p className="hint" id={`${id}-pharmacy-hint`}>
          {labels.pharmacyHint}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`${id}-type`}>{labels.typeLabel}</label>
        <select
          id={`${id}-type`}
          name="type"
          value={type}
          onChange={(e) => {
            if (isReportType(e.target.value)) setType(e.target.value);
          }}
        >
          {REPORT_TYPES.map((value) => (
            <option key={value} value={value}>
              {labels.typeOptions[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={`${id}-message`}>{labels.messageLabel}</label>
        <textarea
          id={`${id}-message`}
          name="message"
          required
          minLength={3}
          maxLength={MESSAGE_MAX}
          aria-describedby={`${id}-message-hint`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {/* Read out with the field; on screen the counter below says the same. */}
        <p className="sr-only" id={`${id}-message-hint`}>
          {labels.messageHint}
        </p>
        <span className="counter" aria-hidden="true">
          {message.length} / {MESSAGE_MAX} {labels.characters}
        </span>
      </div>

      <div className="hp" aria-hidden="true">
        <label htmlFor={`${id}-website`}>{labels.honeypotLabel}</label>
        <input
          id={`${id}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {state.kind === 'error' && (
        <div className="callout danger" role="alert">
          <p>
            <strong>{labels.errorTitle}</strong>{' '}
            {state.failure === 'validation'
              ? labels.errorValidation
              : state.failure === 'network'
                ? labels.errorNetwork
                : labels.errorUnavailable}
          </p>
          {state.failure !== 'validation' && (
            <p>
              {labels.fallbackBody}{' '}
              <a href={fallback} rel="noopener">
                {labels.fallbackLink}
              </a>
            </p>
          )}
        </div>
      )}

      <div className="actions">
        <button type="submit" className="button" disabled={sending}>
          {sending ? labels.sending : labels.submit}
        </button>
      </div>
    </form>
  );
}
