import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent, NovaModelBinding } from '@niscorp/nova/adapters/react';
import { COLOR, SIZE, WEIGHT } from '../lib/tokens';
import { Avatar, Icon } from './display';

const fieldProps = {
  placeholder: z.string().optional(),
  label: z.string().optional(),
  hint: z.string().optional(),
  disabled: z.boolean().optional(),
  invalid: z.boolean().optional(),
  debounce: z.number().optional(),
  submitRef: z.string().optional().describe('Ref to fire on Enter — a form you can finish from the keyboard'),
};

const InputProps = z.object({ ...fieldProps, type: z.enum(['text', 'email', 'tel', 'number', 'date', 'time', 'search']).optional(), big: z.boolean().optional() }).strict();

const coerce = (raw: string, numeric: boolean): string | number => {
  if (!numeric) return raw;
  const parsed = Number(raw);
  return raw.trim() === '' || Number.isNaN(parsed) ? raw : parsed;
};
type InputP = z.infer<typeof InputProps> & { novaRef?: string; novaModel?: NovaModelBinding; value?: unknown };

// A labelled wrapper, so every field in the app has its label in the same place
// and no layout has to remember to put one there.
const Labelled = ({ label, hint, invalid, children }: { label?: string; hint?: string; invalid?: boolean; children: React.ReactNode }): React.ReactElement => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
    {label === undefined ? null : (
      <span style={{ fontSize: SIZE['sm'], fontWeight: WEIGHT['medium'], color: COLOR['soft'] }}>{label}</span>
    )}
    {children}
    {/* A HINT IS PROSE AND GETS A MEASURE. This was the one text block in the
        kit with no cap at all — 11px grey running the full width of whatever
        held it, and the app has hints over a hundred characters long. 12.5px
        with real leading at 52ch reads as help; 11px unbounded reads as fine
        print nobody was meant to finish. */}
    {hint === undefined ? null : (
      <span style={{ fontSize: SIZE['sm'], lineHeight: 1.5, maxWidth: '52ch', color: invalid === true ? COLOR['alert'] : COLOR['mute'] }}>{hint}</span>
    )}
  </div>
);

// Outside the component on purpose: a tree whose shape changes reconciles by
// position, React drops the node, and focus goes with it — so the next
// keystrokes land on the body and vanish.
let lastFocused: { ref: string; caret: number } | null = null;

export const Input: NovaComponent<z.infer<typeof InputProps>> = ({ placeholder, label, hint, type = 'text', debounce, big, disabled, invalid, submitRef, novaRef, novaModel, value }: InputP) => {
  const dispatch = useNovaDispatch();
  const incoming = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const [draft, setDraft] = useState(incoming);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const node = useRef<HTMLInputElement | null>(null);
  const ref = novaModel?.ref ?? novaRef;

  useEffect(() => {
    if (!focused.current) setDraft(incoming);
  }, [incoming]);

  // Mount only. If this field is the one that was being typed into when its
  // node was replaced, take focus back and put the caret where it was.
  useEffect(() => {
    if (ref === undefined || lastFocused?.ref !== ref) return;
    const element = node.current;
    if (element === null) return;
    element.focus();
    const at = Math.min(lastFocused.caret, element.value.length);
    element.setSelectionRange(at, at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = (next: string): void => {
    const ref = novaModel?.ref ?? novaRef;
    if (ref === undefined) return;
    dispatch({ type: 'ui:model', ref, payload: coerce(next, type === 'number') });
  };

  const onChange = (next: string): void => {
    setDraft(next);
    if (debounce === undefined) {
      emit(next);
      return;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => emit(next), debounce);
  };

  return (
    <Labelled label={label} hint={hint} invalid={invalid}>
      <input
        className="ly-field"
        type={type}
        value={draft}
        disabled={disabled === true}
        placeholder={placeholder}
        style={{
          ...(big === true ? { padding: '13px 16px', fontSize: 16 } : {}),
          ...(invalid === true ? { borderColor: 'var(--alert)' } : {}),
        }}
        ref={node}
        onFocus={(e) => {
          focused.current = true;
          if (ref !== undefined) lastFocused = { ref, caret: e.target.selectionStart ?? e.target.value.length };
        }}
        onBlur={() => {
          focused.current = false;
          // A REAL blur clears the claim; an unmount never runs this, which is
          // exactly the difference the restore above depends on.
          if (ref !== undefined && lastFocused?.ref === ref) lastFocused = null;
          if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
          }
          emit(draft);
        }}
        onChange={(e) => {
          if (ref !== undefined) lastFocused = { ref, caret: e.target.selectionStart ?? e.target.value.length };
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || submitRef === undefined) return;
          emit(draft);
          dispatch({ type: 'ui:click', ref: submitRef });
        }}
      />
    </Labelled>
  );
};
Input.meta = { description: 'A text field. `submitRef` fires on Enter so a form can be finished without reaching for the mouse.', propsSchema: InputProps };

const TextareaProps = z.object({ ...fieldProps, rows: z.number().optional() }).strict();
type TextareaP = z.infer<typeof TextareaProps> & { novaRef?: string; novaModel?: NovaModelBinding; value?: unknown };

export const Textarea: NovaComponent<z.infer<typeof TextareaProps>> = ({ placeholder, label, hint, rows, disabled, invalid, novaRef, novaModel, value }: TextareaP) => {
  const dispatch = useNovaDispatch();
  const incoming = typeof value === 'string' ? value : '';
  const [draft, setDraft] = useState(incoming);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(incoming);
  }, [incoming]);
  const emit = (next: string): void => {
    const ref = novaModel?.ref ?? novaRef;
    if (ref !== undefined) dispatch({ type: 'ui:model', ref, payload: next });
  };
  return (
    <Labelled label={label} hint={hint} invalid={invalid}>
      <textarea
        className="ly-field"
        rows={rows ?? 4}
        value={draft}
        disabled={disabled === true}
        placeholder={placeholder}
        style={{ resize: 'vertical', fontFamily: 'inherit' }}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          emit(draft);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          emit(e.target.value);
        }}
      />
    </Labelled>
  );
};
Textarea.meta = { description: 'A multi-line field, for notes.', propsSchema: TextareaProps };

const SelectProps = z.object({ ...fieldProps, options: z.array(z.object({ value: z.string(), label: z.string() })), numeric: z.boolean().optional().describe('Emit the chosen value as a number — for a select bound to an integer column'), emptyLabel: z.string().optional().describe('Adds a leading empty option with this label — "Unassigned", "Any", "None yet"') }).strict();
type SelectP = Partial<z.infer<typeof SelectProps>> & { novaRef?: string; novaModel?: NovaModelBinding; value?: unknown };

export const Select: NovaComponent<Partial<z.infer<typeof SelectProps>>> = ({ options, label, hint, disabled, invalid, numeric, emptyLabel, novaRef, novaModel, value }: SelectP) => {
  const dispatch = useNovaDispatch();
  const current = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return (
    <Labelled label={label} hint={hint} invalid={invalid}>
      <select
        className="ly-field"
        value={current}
        disabled={disabled === true}
        onChange={(e) => {
          const ref = novaModel?.ref ?? novaRef;
          if (ref !== undefined) dispatch({ type: 'ui:model', ref, payload: coerce(e.target.value, numeric === true) });
        }}
      >
        {emptyLabel === undefined ? null : <option value="">{emptyLabel}</option>}
        {(options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Labelled>
  );
};
Select.meta = { description: 'A choice from a list. Options are data — a spec prop, never a component per case.', propsSchema: SelectProps };

const SwitchProps = z.object({ label: z.string().optional(), disabled: z.boolean().optional(), value: z.unknown().optional() }).strict();
type SwitchP = z.infer<typeof SwitchProps> & { novaRef?: string; novaModel?: NovaModelBinding; checked?: unknown };

export const Switch: NovaComponent<z.infer<typeof SwitchProps>> = ({ label, disabled, value, novaRef, novaModel, checked }: SwitchP) => {
  const dispatch = useNovaDispatch();
  const on = checked === true || value === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled === true}
      onClick={() => {
        const ref = novaModel?.ref ?? novaRef;
        if (ref !== undefined) dispatch({ type: 'ui:click', ref, payload: { next: !on } });
      }}
      style={{
        width: 40,
        height: 23,
        flexShrink: 0,
        padding: 2,
        border: 0,
        borderRadius: 999,
        cursor: disabled === true ? 'not-allowed' : 'pointer',
        background: on ? 'var(--ink)' : 'var(--line-strong)',
        transition: 'background-color 0.15s ease',
        opacity: disabled === true ? 0.45 : 1,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 19,
          height: 19,
          borderRadius: '50%',
          background: 'var(--ground)',
          transform: on ? 'translateX(17px)' : 'translateX(0)',
          transition: 'transform 0.15s ease',
        }}
      />
    </button>
  );
};
Switch.meta = { description: 'An on/off control. Emits `{ next }` so the trigger never has to compute a negation.', propsSchema: SwitchProps };

// ── MONEY ────────────────────────────────────────────────────
const MoneyProps = z.object({ ...fieldProps, symbol: z.string().optional(), big: z.boolean().optional() }).strict();
type MoneyP = Partial<z.infer<typeof MoneyProps>> & { novaRef?: string; novaModel?: NovaModelBinding; value?: unknown };

const centsToText = (cents: unknown): string => {
  if (typeof cents === 'number' && Number.isFinite(cents)) return (cents / 100).toFixed(2);
  if (typeof cents === 'string' && cents.trim() !== '' && Number.isFinite(Number(cents))) return (Number(cents) / 100).toFixed(2);
  return '';
};

export const Money: NovaComponent<Partial<z.infer<typeof MoneyProps>>> = ({ label, hint, placeholder, symbol, disabled, invalid, big, submitRef, novaRef, novaModel, value }: MoneyP) => {
  const dispatch = useNovaDispatch();
  const incoming = centsToText(value);
  const [draft, setDraft] = useState(incoming);
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : incoming;

  const commit = (raw: string): void => {
    const ref = novaModel?.ref ?? novaRef;
    if (ref === undefined) return;
    const normalised = raw.replace(',', '.').trim();
    if (normalised === '') {
      dispatch({ type: 'ui:model', ref, payload: 0 });
      return;
    }
    const parsed = Number(normalised);
    if (!Number.isFinite(parsed)) return;
    dispatch({ type: 'ui:model', ref, payload: Math.round(parsed * 100) });
  };

  return (
    <Labelled label={label} hint={hint} invalid={invalid}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
        <span style={{ position: 'absolute', left: 12, fontSize: big === true ? SIZE['lg'] : SIZE['md'], color: COLOR['mute'], pointerEvents: 'none' }}>{symbol ?? '€'}</span>
        <input
          className="ly-field"
          type="text"
          inputMode="decimal"
          disabled={disabled === true}
          aria-invalid={invalid === true}
          placeholder={placeholder ?? '0.00'}
          value={shown}
          style={{ paddingLeft: 26, fontVariantNumeric: 'tabular-nums', ...(big === true ? { fontSize: SIZE['lg'] } : {}) }}
          onFocus={() => {
            setDraft(incoming);
            setEditing(true);
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            commit(draft);
            if (submitRef !== undefined) dispatch({ type: 'ui:click', ref: submitRef });
          }}
        />
      </div>
    </Labelled>
  );
};
Money.meta = { description: 'An amount in the studio currency. Shows decimal, emits cents — the conversion lives here, not in a hint.', propsSchema: MoneyProps };

// ── CHECKBOX ─────────────────────────────────────────────────
const CheckboxProps = z.object({ label: z.string().optional(), disabled: z.boolean().optional(), value: z.unknown().optional(), payload: z.unknown().optional() }).strict();
type CheckboxP = Partial<z.infer<typeof CheckboxProps>> & { novaRef?: string; novaModel?: NovaModelBinding; checked?: unknown };

export const Checkbox: NovaComponent<Partial<z.infer<typeof CheckboxProps>>> = ({ label, disabled, value, payload, novaRef, novaModel, checked }: CheckboxP) => {
  const dispatch = useNovaDispatch();
  const on = checked === true || value === true;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled === true}
      onClick={(e) => {
        e.stopPropagation();
        const ref = novaModel?.ref ?? novaRef;
        if (ref !== undefined) dispatch({ type: 'ui:click', ref, payload: { next: !on, ...(typeof payload === 'object' && payload !== null ? payload : {}) } });
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        flexShrink: 0,
        padding: 0,
        borderRadius: 4,
        cursor: disabled === true ? 'not-allowed' : 'pointer',
        border: on ? '1px solid var(--ink)' : '1px solid var(--line-strong)',
        background: on ? 'var(--ink)' : 'var(--surface)',
        color: 'var(--ground)',
        transition: 'background-color 0.12s ease, border-color 0.12s ease',
      }}
    >
      {on ? <Icon name="check" size={13} /> : null}
    </button>
  );
};
Checkbox.meta = { description: 'One selection. The primitive a bulk action is built from.', propsSchema: CheckboxProps };

// ── PERSON PICKER ────────────────────────────────────────────
const PickerOption = z.object({ value: z.string(), label: z.string(), sub: z.string().optional() }).loose();
const PersonPickerProps = z
  .object({
    ...fieldProps,
    options: z.array(PickerOption).optional(),
    emptyLabel: z.string().optional(),
    noMatch: z.string().optional(),
  })
  .strict();
type PickerP = Partial<z.infer<typeof PersonPickerProps>> & { novaRef?: string; novaModel?: NovaModelBinding; value?: unknown };

const pickerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '9px 13px',
  border: 0,
  background: 'none',
  cursor: 'pointer',
  textAlign: 'left',
};

export const PersonPicker: NovaComponent<Partial<z.infer<typeof PersonPickerProps>>> = ({ label, hint, placeholder, options, emptyLabel, noMatch, disabled, invalid, novaRef, novaModel, value }: PickerP) => {
  const dispatch = useNovaDispatch();
  const list = Array.isArray(options) ? options : [];
  const current = typeof value === 'string' ? value : '';
  const chosen = list.find((o) => o.value === current);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const needle = query.trim().toLowerCase();
  const matches = needle === '' ? list.slice(0, 8) : list.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(needle)).slice(0, 8);

  const choose = (option: { value: string } | undefined): void => {
    const ref = novaModel?.ref ?? novaRef;
    if (ref !== undefined) dispatch({ type: 'ui:model', ref, payload: option?.value ?? '' });
    setQuery('');
    setOpen(false);
  };

  return (
    <Labelled label={label} hint={hint} invalid={invalid}>
      <div style={{ position: 'relative', width: '100%' }}>
        {chosen === undefined ? (
          <input
            className="ly-field"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            disabled={disabled === true}
            placeholder={placeholder ?? 'Search by name or email'}
            value={query}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
        ) : (
          <div className="ly-field" style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'default' }}>
            <Avatar name={chosen.label} size={22} />
            <span style={{ fontSize: SIZE['md'], color: COLOR['ink'], flex: '1 1 auto', minWidth: 0 }}>{chosen.label}</span>
            <button
              type="button"
              aria-label="Clear"
              onClick={() => choose(undefined)}
              style={{ display: 'inline-flex', alignItems: 'center', border: 0, background: 'none', padding: 2, cursor: 'pointer', color: 'var(--ink-mute)' }}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}

        {!open || chosen !== undefined ? null : (
          <div
            role="listbox"
            style={{
              position: 'absolute',
              zIndex: 40,
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              maxHeight: 244,
              overflowY: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {emptyLabel === undefined ? null : (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(undefined)} style={pickerRow}>
                <span style={{ fontSize: SIZE['md'], color: COLOR['mute'] }}>{emptyLabel}</span>
              </button>
            )}
            {matches.length === 0 ? (
              <div style={{ padding: '12px 13px', fontSize: SIZE['sm'], color: COLOR['mute'] }}>{noMatch ?? 'Nobody by that name.'}</div>
            ) : (
              matches.map((option) => (
                <button key={option.value} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(option)} style={pickerRow}>
                  <Avatar name={option.label} size={26} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: SIZE['md'], color: COLOR['ink'] }}>{option.label}</span>
                    {option.sub === undefined ? null : <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'] }}>{option.sub}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </Labelled>
  );
};
PersonPicker.meta = { description: 'Find a person, do not retype one. The field the staff form never had.', propsSchema: PersonPickerProps };
