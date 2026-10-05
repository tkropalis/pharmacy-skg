import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { IndexedMedicine, Locale } from '@pharmacy-skg/core';
import type { searchEl } from '../../i18n/search.el.ts';
import { fill, formatPrice, longIsoDate } from '../../lib/format.ts';
import { loadMedicines } from '../../lib/medicine-index.ts';
import type { LoadedMedicines } from '../../lib/medicine-index.ts';
import { prepareSearch, searchMedicines, splitName } from '../../lib/medicine-search.ts';
import { Icon } from '../app/icons.tsx';
import './search.css';

export type SearchText = typeof searchEl;

const PAGE_SIZE = 30;
/** The history entry that lets the phone's Back button close the search. It has no URL. */
const HISTORY_KEY = 'medicineSearch';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly data: LoadedMedicines };

interface Props {
  readonly locale: Locale;
  readonly text: SearchText;
  readonly onClosed: () => void;
}

/**
 * The medicine search (decision D24): a full-screen dialog over any page. The query lives in
 * this component's state only: it is not sent, stored, put in the URL or counted, and it is
 * gone when the dialog closes.
 */
export function MedicineSearch({ locale, text, onClosed }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<IndexedMedicine | null>(null);
  const lastSelected = useRef<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  // Open as a modal dialog, and let the Back button close it (an entry without a URL).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    inputRef.current?.focus();
    history.pushState({ [HISTORY_KEY]: true }, '');
    const onPop = () => dialog.close();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadMedicines().then(
      (data) => !cancelled && setLoad({ status: 'ready', data }),
      () => !cancelled && setLoad({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const data = load.status === 'ready' ? load.data : null;
  const entries = useMemo(() => (data ? prepareSearch(data.medicines) : []), [data]);
  const result = useMemo(() => searchMedicines(entries, deferredQuery), [entries, deferredQuery]);
  const forms = useMemo(() => new Set(Object.keys(text.forms)), [text]);

  useEffect(() => setVisible(PAGE_SIZE), [deferredQuery]);

  // Each view starts at its top; the details take the focus, and Back returns it to the row.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (selected) {
      detailsHeadingRef.current?.focus();
    } else if (lastSelected.current) {
      document.getElementById(`ms-${lastSelected.current}`)?.focus();
    }
  }, [selected]);

  function onClose() {
    if ((history.state as Record<string, unknown> | null)?.[HISTORY_KEY]) history.back();
    onClosed();
  }

  const count = result.results.length;
  // Nothing is said before the person types; the field's placeholder is the only prompt.
  const status =
    load.status === 'loading'
      ? deferredQuery.trim() === ''
        ? ''
        : text.loading
      : load.status === 'error'
        ? ''
        : result.tooShort
          ? deferredQuery.trim() === ''
            ? ''
            : text.hint
          : count === 0
            ? text.none
            : count === 1
              ? text.one
              : fill(text.many, { n: count });

  const shown = result.results.slice(0, visible);

  return (
    <dialog ref={dialogRef} className="ms" aria-labelledby="ms-title" onClose={onClose}>
      <h2 id="ms-title" className="sr-only">
        {text.title}
      </h2>
      <div className="ms-bar">
        {selected ? (
          <button type="button" className="ms-back" onClick={() => setSelected(null)}>
            <Icon name="back" />
            {text.details.back}
          </button>
        ) : (
          <form role="search" className="ms-field" onSubmit={(event) => event.preventDefault()}>
            <Icon name="search" size={18} />
            <label htmlFor="ms-query" className="sr-only">
              {text.inputLabel}
            </label>
            <input
              ref={inputRef}
              id="ms-query"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={text.placeholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
        )}
        <button
          type="button"
          className="ms-close"
          aria-label={text.close}
          onClick={() => dialogRef.current?.close()}
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="ms-body" ref={bodyRef}>
        {selected ? (
          <Details
            medicine={selected}
            forms={forms}
            locale={locale}
            text={text}
            headingRef={detailsHeadingRef}
          />
        ) : (
          <>
            <p className="ms-status" role="status">
              {status}
            </p>
            {load.status === 'error' && (
              <div className="ms-error" role="alert">
                <p>{text.loadError}</p>
                <button
                  type="button"
                  className="ms-button"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  {text.retry}
                </button>
              </div>
            )}

            {shown.length > 0 && (
              <ol className="ms-results" aria-label={text.resultsLabel}>
                {shown.map((medicine) => (
                  <li key={medicine.barcode}>
                    <Row
                      medicine={medicine}
                      forms={forms}
                      locale={locale}
                      text={text}
                      onSelect={() => {
                        lastSelected.current = medicine.barcode;
                        setSelected(medicine);
                      }}
                    />
                  </li>
                ))}
              </ol>
            )}
            {shown.length < count && (
              <button
                type="button"
                className="ms-button ms-more"
                onClick={() => setVisible((n) => n + PAGE_SIZE)}
              >
                {text.showMore}
              </button>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

function priceLabel(medicine: IndexedMedicine, text: SearchText): string {
  return medicine.otc ? text.indicativePrice : text.maxPrice;
}

/** The form in plain words when known, else as printed; then strength and pack size. */
function packLine(name: string, forms: ReadonlySet<string>, text: SearchText) {
  const { brand, form, rest } = splitName(name, forms);
  const plainForm =
    form === null ? null : ((text.forms as Readonly<Record<string, string>>)[form] ?? form);
  return {
    brand,
    line: [plainForm, rest].filter((part) => part !== null && part !== '').join(' · '),
  };
}

interface RowProps {
  readonly medicine: IndexedMedicine;
  readonly forms: ReadonlySet<string>;
  readonly locale: Locale;
  readonly text: SearchText;
  readonly onSelect: () => void;
}

function Row({ medicine, forms, locale, text, onSelect }: RowProps) {
  const { brand, line } = packLine(medicine.name, forms, text);
  return (
    <button type="button" id={`ms-${medicine.barcode}`} className="ms-row" onClick={onSelect}>
      <span className="ms-row-main">
        <span className="ms-brand">{brand}</span>
        {line !== '' && <span className="ms-desc">{line}</span>}
        {medicine.shortage && (
          <span className="ms-badge">
            <Icon name="warning" size={14} />
            {text.shortage}
          </span>
        )}
      </span>
      <span className="ms-price">{formatPrice(medicine.price, locale)}</span>
    </button>
  );
}

interface DetailsProps {
  readonly medicine: IndexedMedicine;
  readonly forms: ReadonlySet<string>;
  readonly locale: Locale;
  readonly text: SearchText;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

function Details({ medicine, forms, locale, text, headingRef }: DetailsProps) {
  const { brand, line } = packLine(medicine.name, forms, text);
  const d = text.details;
  const shortage = medicine.shortage;
  return (
    <article className="ms-details" aria-labelledby="ms-details-title">
      <h3 id="ms-details-title" className="ms-details-title" tabIndex={-1} ref={headingRef}>
        {brand}
      </h3>
      {line !== '' && <p className="ms-desc">{line}</p>}

      <p className="ms-price-big">
        <span className="ms-price">{formatPrice(medicine.price, locale)}</span>
        <span className="ms-price-label">{priceLabel(medicine, text)}</span>
      </p>
      <p className="ms-note">
        {medicine.otc ? d.indicativeNote : d.maxPriceNote}
        {medicine.notReimbursed && <> {d.notReimbursed}</>}
      </p>

      {shortage && (
        <div className="ms-shortage" role="note">
          <Icon name="warning" />
          <p>
            <strong>{text.shortage}.</strong>
            {shortage.to && (
              <> {fill(d.shortageUntil, { to: longIsoDate(shortage.to, locale) })}</>
            )}{' '}
            {d.shortageAdvice}
          </p>
        </div>
      )}

      {(medicine.substance || medicine.company) && (
        <dl className="ms-facts">
          {medicine.substance && (
            <div>
              <dt>{d.substance}</dt>
              <dd>{medicine.substance}</dd>
            </div>
          )}
          {medicine.company && (
            <div>
              <dt>{d.company}</dt>
              <dd>{medicine.company}</dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}
