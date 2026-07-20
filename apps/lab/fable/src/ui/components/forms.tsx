import { type ReactNode, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { Icon } from './display';

// Form inputs — Input, Select, Textarea. Each is two-way bound via a layout
// `model: "$.path"`: the renderer feeds the current value in as `value`, and
// a change dispatches `ui:model`, which the runtime turns into a `set` on the
// bound path (no per-field trigger).

type Bound = { novaModel?: { ref: string; path: string } };

const asText = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

// Wrap a control in a labelled field (label + control) when `label` is given.
const field = (label: string | undefined, required: boolean | undefined, control: ReactNode): ReactNode =>
  label === undefined ? (
    control
  ) : (
    <label className="fb-field">
      <span className="fb-label">
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
}: z.infer<typeof InputProps> & Bound) => {
  const dispatch = useNovaDispatch();
  const debounced = typeof debounce === 'number' && debounce > 0;
  // Debounced mode keeps a local echo of the text so typing is instant while
  // the `ui:model` dispatch (which re-runs the query) fires on a trailing
  // timer. `lastSent` lets the effect adopt *external* changes to the bound
  // value without clobbering keystrokes mid-type. Unset/0 = fully controlled
  // + immediate (form fields).
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
      className="fb-input"
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
    />
  );
  return field(
    label,
    required,
    icon === undefined ? (
      input
    ) : (
      <span className="fb-inputwrap">
        <Icon name={icon} size={15} />
        {input}
      </span>
    ),
  );
};
Input.meta = { description: 'Text input. Two-way bound via `model:`.', propsSchema: InputProps };

// ─── Select ────────────────────────────────────────────────
const SelectProps = z
  .object({
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    placeholder: z.string().optional(),
    label: z.string().optional(),
    required: z.boolean().optional(),
    value: z.unknown().optional(),
  })
  .strict();

export const Select: NovaComponent<z.infer<typeof SelectProps>> = ({
  options = [],
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
      className="fb-select"
      value={asText(value)}
      onChange={(e) => {
        if (novaModel) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.value });
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>,
  );
};
Select.meta = {
  description: 'Dropdown select over `{ value, label }` options. Two-way bound via `model:`.',
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
      className="fb-textarea"
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
