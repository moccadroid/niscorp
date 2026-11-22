import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { useModelWrite } from '../hooks/model.js';
import { inputStyle } from './shared.js';
import { JsonEditor } from './json-editor.js';

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

// Emptied, a number is absent, or null where the schema takes null.
export const LoomNumber: NovaComponent<{ value?: unknown; integer?: boolean; nullable?: boolean }> = ({ value, integer, nullable, novaModel }) => {
  const set = useModelWrite(novaModel);
  return (
    <input
      type="number"
      step={integer === true ? 1 : 'any'}
      value={Number.isFinite(value) ? (value as number) : ''}
      onChange={(event) => {
        const raw = event.target.value;
        set(raw ? Number(raw) : nullable === true ? null : undefined);
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
  // A <select> speaks strings, and an enum's values may be numbers. The option's
  // own value is written: the schema refuses "2" where it means 2.
  const choose = (text: string): void => {
    const chosen = (options ?? []).find((option) => String(option.value) === text);
    set(chosen === undefined ? text : chosen.value);
  };
  // With no value among the options, a disabled "—" row is shown, so every real
  // option is a change and choosing the first one writes it.
  const hasValue = (options ?? []).some((option) => option.value === value);
  return (
    <select value={hasValue ? String(value) : ''} onChange={(event) => choose(event.target.value)} style={inputStyle}>
      {hasValue ? null : (
        <option value="" disabled>
          —
        </option>
      )}
      {(options ?? []).map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export const LoomRaw: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const set = useModelWrite(novaModel);
  return <JsonEditor value={value} onChange={set} />;
};
