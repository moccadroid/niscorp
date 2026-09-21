import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { classes, isRow, num, oneOf, text } from './props';
import type { Props } from './props';

// Controls: the primitives that send events up. Each emits `ui:model` or
// `ui:click` on its node's ref and knows nothing about who is listening.

// THE SHELL IS REMOTE, and the input is written for that (nova ADAPTER.md §6):
//
//   · it keeps a local DRAFT while focused, so a tree echo arriving mid-word —
//     and on the intent line one arrives after nearly every keystroke, because
//     the loop writes the line's tone — can never reset what is being typed;
//   · it honours `debounce`, default 0. The intent line leaves it at 0 on
//     purpose: the pacing is the server's.
export const Input: NovaComponent<Props> = ({ value, placeholder, type, size, debounce, autofocus, disabled, novaModel, novaRef }) => {
  const dispatch = useNovaDispatch();
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debounceMs = num(debounce, 0);

  const clearPending = (): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => clearPending, []);

  const fire = (next: string): void => {
    if (novaModel !== undefined) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: next });
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value;
    setDraft(next);
    clearPending();
    if (debounceMs <= 0) return fire(next);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      fire(next);
    }, debounceMs);
  };

  return (
    <input
      className={classes('en-input', `en-input--${oneOf(size, ['field', 'line'], 'field')}`)}
      type={oneOf(type, ['text', 'number'], 'text')}
      placeholder={text(placeholder)}
      disabled={disabled === true}
      autoFocus={autofocus === true}
      spellCheck={false}
      autoComplete="off"
      value={draft ?? text(value)}
      onChange={onChange}
      onKeyDown={(event) => {
        // Enter is an EVENT, not an edit: it goes up as `ui:key` for whatever
        // trigger cares, after the keystrokes before it have been flushed — a
        // handler that reads the text must not read it one debounce stale.
        if (event.key !== 'Enter') return;
        const ref = novaRef ?? novaModel?.ref;
        if (ref === undefined) return;
        if (timer.current !== undefined && draft !== null) {
          clearPending();
          fire(draft);
        }
        dispatch({ type: 'ui:key', key: 'Enter', ref });
      }}
      onFocus={() => {
        setDraft(text(value));
        // Focus goes up too: it is the earliest sign somebody is about to type,
        // and what a host does with that head start is its own business.
        const ref = novaRef ?? novaModel?.ref;
        if (ref !== undefined) dispatch({ type: 'ui:focus', ref });
      }}
      onBlur={() => {
        // Flush a pending keystroke, then hand authority back to the server.
        if (timer.current !== undefined && draft !== null) {
          clearPending();
          fire(draft);
        }
        setDraft(null);
      }}
    />
  );
};

export const Button: NovaComponent<Props> = ({ children, label, variant, disabled, novaRef }) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      className={classes('en-button', `en-button--${oneOf(variant, ['primary', 'ghost', 'warn', 'quiet'], 'primary')}`)}
      disabled={disabled === true}
      onClick={novaRef === undefined ? undefined : () => dispatch({ type: 'ui:click', ref: novaRef })}
    >
      {label === undefined ? children : text(label)}
    </button>
  );
};

// A KEY PRESSED ANYWHERE is a click on this ref — unless somebody is typing in a
// field, where the key is a character. Draws nothing.
export const Hotkey: NovaComponent<Props> = ({ value, novaRef }) => {
  const dispatch = useNovaDispatch();
  const key = text(value);
  useEffect(() => {
    if (novaRef === undefined || key === '') return undefined;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (event.key !== key || isTyping) return;
      event.preventDefault();
      dispatch({ type: 'ui:click', ref: novaRef });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, key, novaRef]);
  return null;
};

export const Field: NovaComponent<Props> = ({ children, label, hint }) => (
  <label className="en-field">
    <span className="en-text en-text--label en-tone--mute">{text(label)}</span>
    {children}
    {text(hint) === '' ? null : <span className="en-text en-tone--mute">{text(hint)}</span>}
  </label>
);

// `options` is rows; `valueKey` / `labelKey` say which columns are which, so
// the same primitive takes `[{ value, label }]` authored in a layout and
// `[{ id, label }]` straight off a read. `numeric` sends the picked value as a
// number — a DOM select only ever has strings.
export const Select: NovaComponent<Props> = ({ options, value, valueKey, labelKey, placeholder, numeric, novaModel }) => {
  const dispatch = useNovaDispatch();
  const keyOfValue = text(valueKey) || 'value';
  const keyOfLabel = text(labelKey) || 'label';
  const choices = Array.isArray(options) ? options.filter(isRow) : [];
  return (
    <select
      className="en-input en-input--field"
      value={text(value)}
      onChange={(event) => {
        if (novaModel === undefined) return;
        const picked = event.target.value;
        dispatch({ type: 'ui:model', ref: novaModel.ref, payload: numeric === true ? num(picked, 0) : picked });
      }}
    >
      {text(placeholder) === '' ? null : <option value="">{text(placeholder)}</option>}
      {choices.map((choice) => (
        <option key={text(choice[keyOfValue])} value={text(choice[keyOfValue])}>
          {text(choice[keyOfLabel])}
        </option>
      ))}
    </select>
  );
};
