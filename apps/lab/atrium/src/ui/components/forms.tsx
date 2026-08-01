import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { Icon } from './display';

// Form primitives. Each holds a local draft while focused and writes back on
// `ui:model`, so a server-side shell round trip never eats a keystroke.

const InputProps = z.object({ placeholder: z.string().optional(), icon: z.string().optional(), type: z.string().optional(), debounce: z.number().optional(), big: z.boolean().optional(), submitRef: z.string().optional().describe('Ref fired as ui:click when Enter is pressed.') }).strict();

type InputP = z.infer<typeof InputProps> & { novaRef?: string; novaModel?: { ref: string; path: string }; value?: unknown };

export const Input: NovaComponent<z.infer<typeof InputProps>> = ({ placeholder, icon, type = 'text', debounce, big, submitRef, novaRef, novaModel, value }: InputP) => {
  const dispatch = useNovaDispatch();
  const incoming = typeof value === 'string' ? value : '';
  const [draft, setDraft] = useState(incoming);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!focused.current) setDraft(incoming);
  }, [incoming]);
  const emit = (next: string): void => {
    const ref = novaModel?.ref ?? novaRef;
    if (ref === undefined) return;
    dispatch({ type: 'ui:model', ref, payload: next });
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
    <div style={{ position: 'relative', width: '100%' }}>
      {icon !== undefined ? <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><Icon name={icon} size={16} color="faint" /></span> : null}
      <input
        className={cx('at-field')}
        type={type}
        value={draft}
        placeholder={placeholder}
        style={{ paddingLeft: icon !== undefined ? 36 : undefined, ...(big === true ? { padding: '14px 16px', fontSize: 16, borderRadius: 999, paddingLeft: icon !== undefined ? 42 : 18 } : {}) }}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (timer.current !== null) clearTimeout(timer.current);
          emit(draft);
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && submitRef !== undefined) {
            if (timer.current !== null) clearTimeout(timer.current);
            emit(draft);
            dispatch({ type: 'ui:click', ref: submitRef });
            // Enter keeps the field focused, and a focused field ignores
            // incoming syncs (draft preservation) — so the action's own
            // `set draft ''` would be dropped. A submit empties the composer.
            setDraft('');
          }
        }}
      />
    </div>
  );
};
Input.meta = { description: 'A text field. `submitRef` turns Enter into a click on another ref.', propsSchema: InputProps };

const TextareaProps = z.object({ placeholder: z.string().optional(), rows: z.number().optional() }).strict();

type TextareaP = z.infer<typeof TextareaProps> & { novaRef?: string; novaModel?: { ref: string; path: string }; value?: unknown };

export const Textarea: NovaComponent<z.infer<typeof TextareaProps>> = ({ placeholder, rows = 4, novaRef, novaModel, value }: TextareaP) => {
  const dispatch = useNovaDispatch();
  const incoming = typeof value === 'string' ? value : '';
  const [draft, setDraft] = useState(incoming);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(incoming);
  }, [incoming]);
  return (
    <textarea
      className="at-field"
      rows={rows}
      value={draft}
      placeholder={placeholder}
      style={{ resize: 'vertical', lineHeight: 1.5 }}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        const ref = novaModel?.ref ?? novaRef;
        if (ref !== undefined) dispatch({ type: 'ui:model', ref, payload: draft });
      }}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
};
Textarea.meta = { description: 'A multi-line field.', propsSchema: TextareaProps };

const SelectProps = z.object({ options: z.array(z.object({ value: z.string(), label: z.string() })), placeholder: z.string().optional() }).strict();

type SelectP = z.infer<typeof SelectProps> & { novaRef?: string; novaModel?: { ref: string; path: string }; value?: unknown };

export const Select: NovaComponent<z.infer<typeof SelectProps>> = ({ options, placeholder, novaRef, novaModel, value }: SelectP) => {
  const dispatch = useNovaDispatch();
  return (
    <select
      className="at-field"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => {
        const ref = novaModel?.ref ?? novaRef;
        if (ref !== undefined) dispatch({ type: 'ui:model', ref, payload: e.target.value });
      }}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
Select.meta = { description: 'A single-choice field.', propsSchema: SelectProps };

const SwitchProps = z.object({ on: z.boolean().optional(), label: z.string().optional(), value: z.unknown().optional() }).strict();

type SwitchP = z.infer<typeof SwitchProps> & { novaRef?: string };

export const Switch: NovaComponent<z.infer<typeof SwitchProps>> = ({ on, label, value, novaRef }: SwitchP) => {
  const dispatch = useNovaDispatch();
  return (
    <button type="button" onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: value })} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 40, height: 23, borderRadius: 999, background: on === true ? 'var(--accent)' : 'var(--line)', position: 'relative', transition: 'background 150ms ease', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 3, left: on === true ? 20 : 3, width: 17, height: 17, borderRadius: 999, background: '#fff', transition: 'left 150ms ease', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
      </span>
      {label !== undefined ? <span>{label}</span> : null}
    </button>
  );
};
Switch.meta = { description: 'An on/off control. Emits its `value` on click; the action decides the next state.', propsSchema: SwitchProps };
