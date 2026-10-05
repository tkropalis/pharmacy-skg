import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Dictionary } from '../../i18n/index.ts';
import { fill } from '../../lib/format.ts';
import { searchLocalities } from '../../lib/places.ts';
import type { Locality } from '../../lib/places.ts';
import { Icon } from './icons.tsx';

const HISTORY_KEY = 'pharmacy-skg:area-picker';
const SHOWN = 40;

interface AreaPickerProps {
  readonly text: Dictionary['app'];
  readonly localities: readonly Locality[];
  readonly onPick: (locality: Locality) => void;
  readonly onClose: () => void;
}

/**
 * Choosing an area: a full-screen dialog with the field at the top and the areas right under
 * it, so the on-screen keyboard never covers them (it covered the field and the results when
 * the search sat in the middle of the sheet). Back closes it.
 */
export function AreaPicker({ text, localities, onPick, onClose }: AreaPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchLocalities(localities, query, SHOWN), [localities, query]);
  const left = useRef(false);

  /** Takes back the history entry the dialog added (once; Back has already taken it). */
  function leave() {
    if (left.current) return;
    left.current = true;
    if ((history.state as Record<string, unknown> | null)?.[HISTORY_KEY]) history.back();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    inputRef.current?.focus();
    history.pushState({ [HISTORY_KEY]: true }, '');
    const onPop = () => dialog.close();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Picking an area can remove the button that opened the dialog, and the dialog with it.
      leave();
    };
  }, []);

  function onClosed() {
    leave();
    onClose();
  }

  return (
    <dialog ref={dialogRef} className="ap" aria-labelledby={`${id}-title`} onClose={onClosed}>
      <h2 id={`${id}-title`} className="sr-only">
        {text.origin.areaLabel}
      </h2>
      <div className="ap-bar">
        <form role="search" className="ap-field" onSubmit={(event) => event.preventDefault()}>
          <Icon name="search" />
          <label htmlFor={`${id}-q`} className="sr-only">
            {text.origin.areaSearch}
          </label>
          <input
            ref={inputRef}
            id={`${id}-q`}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={text.origin.areaHint}
            value={query}
            aria-describedby={`${id}-count`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <button
          type="button"
          className="ap-close"
          aria-label={text.close}
          onClick={() => dialogRef.current?.close()}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <p id={`${id}-count`} className="sr-only" role="status">
        {matches.length === 0
          ? text.origin.areaNone
          : matches.length === 1
            ? text.origin.areaOne
            : fill(text.origin.areaCount, { n: matches.length })}
      </p>
      <div className="ap-body">
        {matches.length === 0 ? (
          <p className="ap-none">{text.origin.areaNone}</p>
        ) : (
          <ul className="picker-list">
            {matches.map((locality) => (
              <li key={locality.name}>
                <button
                  type="button"
                  className="picker-item"
                  onClick={() => {
                    onPick(locality);
                    dialogRef.current?.close();
                  }}
                >
                  <span>{locality.name}</span>
                  <span className="muted">
                    {fill(text.origin.areaPharmacies, { n: locality.count })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
