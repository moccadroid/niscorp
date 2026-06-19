import { type ReactNode, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';
import { Icon } from './display';

// Form inputs — Input, Select, Textarea, Checkbox. Each is two-way bound via a
// layout `model: "$.path"`: the renderer feeds the current value in as `value`,
// and a change dispatches `ui:model`, which the runtime turns into a `set` on
// the bound path (no per-field trigger). Styling: .rl-input / .rl-field in
// ui.css.

type Bound = { novaModel?: { ref: string; path: string } };

const asText = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

// Wrap a control in a labelled field (label + control) when `label` is given.
const field = (label: string | undefined, required: boolean | undefined, control: ReactNode): ReactNode =>
  label === undefined ? (
    control
  ) : (
    <label className="rl-field">
      <span className="rl-label">
        {label}
        {required === true && <span>*</span>}
      </span>
      {control}
    </label>
  );

// ─── Input ─────────────────────────────────────────────────
const InputProps = z
  .object({
    type: z.string().optional(),
    placeholder: z.string().optional(),
    label: z.string().optional(),
    required: z.boolean().optional(),
    icon: z.string().optional().describe('A leading icon name (e.g. "search").'),
    debounce: z
      .number()
      .optional()
      .describe('Delay (ms) before the typed value is dispatched as `ui:model`. 0/unset = immediate (forms). Set ~200 on a search box so each keystroke does not re-run the query.'),
    value: z.unknown().optional(),
  })
  .strict();

export const Input: NovaComponent<z.infer<typeof InputProps>> = ({
  type = 'text',
  placeholder,
  label,
  required,
  icon,
  debounce,
  value,
  novaModel,
  novaRef,
}: z.infer<typeof InputProps> & Bound & { novaRef?: string }) => {
  const dispatch = useNovaDispatch();
  const debounced = typeof debounce === 'number' && debounce > 0;
  // Debounced mode keeps a local echo of the text so typing is instant while the
  // `ui:model` dispatch (which re-runs the query) fires only on a trailing timer.
  // `lastSent` lets the effect adopt *external* changes to the bound value (e.g.
  // an Escape that clears it) without clobbering keystrokes mid-type. Unset/0 =
  // fully controlled + immediate, exactly as before (so form fields are untouched).
  const [local, setLocal] = useState(asText(value));
  const lastSent = useRef(asText(value));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const v = asText(value);
    if (v !== lastSent.current) {
      lastSent.current = v;
      setLocal(v);
    }
  }, [value]);
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
  const send = (v: string): void => {
    lastSent.current = v;
    if (novaModel) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: v });
  };
  const input = (
    <input
      className="rl-input"
      type={type}
      placeholder={placeholder}
      value={debounced ? local : asText(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (debounced) {
          setLocal(v);
          if (timer.current !== undefined) clearTimeout(timer.current);
          timer.current = setTimeout(() => send(v), debounce);
        } else {
          send(v);
        }
      }}
      onKeyDown={(e) => {
        // With a ref, the input also emits `ui:key` so triggers can handle
        // navigation (e.g. the action search's ↑/↓/Enter/Esc). Arrows are prevented
        // so the caret doesn't jump while moving the selection.
        if (novaRef === undefined) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.preventDefault();
        dispatch({ type: 'ui:key', ref: novaRef, key: e.key });
      }}
    />
  );
  return field(
    label,
    required,
    icon === undefined ? (
      input
    ) : (
      <span className="rl-inputwrap">
        <Icon name={icon} size={15} />
        {input}
      </span>
    ),
  );
};
Input.meta = { description: 'Text input. Two-way bound via `model:`.', propsSchema: InputProps };

// ─── Select ────────────────────────────────────────────────
// Options are objects; which keys hold the value + label is configurable
// (`valueKey`/`labelKey`, default value/label). That lets id-bearing reads use
// entity-distinct shapes — `[{ company_id, name }]` vs `[{ stage_id, name }]` —
// which the shape-keyed Vex cache then keeps apart (same `{value,label}` shape
// for two different lists would collide on one cache entry).
const SelectProps = z
  .object({
    options: z.array(z.record(z.string(), z.unknown())).optional(),
    valueKey: z.string().optional().describe('Option field for the value. Default "value".'),
    labelKey: z.string().optional().describe('Option field for the label. Default "label".'),
    placeholder: z.string().optional(),
    label: z.string().optional(),
    required: z.boolean().optional(),
    value: z.unknown().optional(),
  })
  .strict();

export const Select: NovaComponent<z.infer<typeof SelectProps>> = ({
  options = [],
  valueKey = 'value',
  labelKey = 'label',
  placeholder,
  label,
  required,
  value,
  novaModel,
}: z.infer<typeof SelectProps> & Bound) => {
  const dispatch = useNovaDispatch();
  return field(
    label,
    required,
    <select
      className="rl-select"
      value={asText(value)}
      onChange={(e) => {
        if (novaModel) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.value });
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o, i) => {
        const v = asText(o[valueKey]);
        return (
          <option key={v !== '' ? v : i} value={v}>
            {asText(o[labelKey])}
          </option>
        );
      })}
    </select>,
  );
};
Select.meta = {
  description: 'Dropdown select. Options are objects; `valueKey`/`labelKey` (default value/label) pick the fields. Two-way bound via `model:`.',
  propsSchema: SelectProps,
};

// ─── Textarea ──────────────────────────────────────────────
const TextareaProps = z
  .object({
    placeholder: z.string().optional(),
    label: z.string().optional(),
    required: z.boolean().optional(),
    rows: z.number().optional(),
    value: z.unknown().optional(),
  })
  .strict();

export const Textarea: NovaComponent<z.infer<typeof TextareaProps>> = ({
  placeholder,
  label,
  required,
  rows,
  value,
  novaModel,
}: z.infer<typeof TextareaProps> & Bound) => {
  const dispatch = useNovaDispatch();
  return field(
    label,
    required,
    <textarea
      className="rl-textarea"
      placeholder={placeholder}
      rows={rows}
      value={asText(value)}
      onChange={(e) => {
        if (novaModel) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.value });
      }}
    />,
  );
};
Textarea.meta = {
  description: 'Multi-line text input. Two-way bound via `model:`.',
  propsSchema: TextareaProps,
};

// ─── Checkbox ──────────────────────────────────────────────
const CheckboxProps = z.object({ label: z.string().optional(), value: z.unknown().optional() }).strict();

export const Checkbox: NovaComponent<z.infer<typeof CheckboxProps>> = ({
  label,
  value,
  novaModel,
}: z.infer<typeof CheckboxProps> & Bound) => {
  const dispatch = useNovaDispatch();
  const checked = value === true;
  return (
    <label className="rl-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          if (novaModel) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.checked });
        }}
      />
      <span className="rl-check__box">{checked && <Check />}</span>
      {label}
    </label>
  );
};
Checkbox.meta = { description: 'Boolean checkbox. Two-way bound via `model:`.', propsSchema: CheckboxProps };

// ─── Switch ────────────────────────────────────────────────
const SwitchProps = z.object({ value: z.unknown().optional() }).strict();

export const Switch: NovaComponent<z.infer<typeof SwitchProps>> = ({
  value,
  novaModel,
}: z.infer<typeof SwitchProps> & Bound) => {
  const dispatch = useNovaDispatch();
  return (
    <label className="rl-switch">
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => {
          if (novaModel) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.checked });
        }}
      />
      <span className="rl-switch__track" />
      <span className="rl-switch__thumb" />
    </label>
  );
};
Switch.meta = { description: 'Boolean toggle switch. Two-way bound via `model:`.', propsSchema: SwitchProps };
