import type { NovaComponent } from '@niscorp/nova/react';
import { useModelWrite } from '../hooks/model.js';
import { inputStyle } from './shared.js';
import { JsonEditor } from './json-editor.js';

// The leaf controls: each reads its value from the auto-bound `value` prop and
// writes back through `useModelWrite`.

const HTML_INPUT_TYPE: Record<string, string> = { email: 'email', uri: 'url', date: 'date' };

export const LoomText: NovaComponent<{ value?: unknown; format?: string; placeholder?: string }> = ({
  value,
  format,
  placeholder,
  novaModel,
}) => {
  const set = useModelWrite(novaModel);
  return (
    <input
      type={HTML_INPUT_TYPE[format ?? ''] ?? 'text'}
      placeholder={placeholder}
      value={String(value ?? '')}
      onChange={(event) => set(event.target.value)}
      style={inputStyle}
    />
  );
};

export const LoomNumber: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const set = useModelWrite(novaModel);
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? (value as number) : ''}
      onChange={(event) => {
        const raw = event.target.value;
        set(raw ? Number(raw) : null);
      }}
      style={inputStyle}
    />
  );
};

export const LoomCheckbox: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const set = useModelWrite(novaModel);
  return (
    <input
      type="checkbox"
      checked={Boolean(value)}
      onChange={(event) => set(event.target.checked)}
      style={{ width: 16, height: 16 }}
    />
  );
};

export const LoomSelect: NovaComponent<{
  value?: unknown;
  options?: { value: unknown; label: string }[];
}> = ({ value, options, novaModel }) => {
  const set = useModelWrite(novaModel);
  return (
    <select value={String(value ?? '')} onChange={(event) => set(event.target.value)} style={inputStyle}>
      {(options ?? []).map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// The raw role: JsonEditor wired to the model.
export const LoomRaw: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const set = useModelWrite(novaModel);
  return <JsonEditor value={value} onChange={set} />;
};
