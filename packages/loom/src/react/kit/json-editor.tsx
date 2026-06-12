import { useEffect, useState, type CSSProperties, type FC } from 'react';
import { inputStyle } from './shared.js';

// A controlled JSON editor: a textarea with pretty-printed JSON that commits only
// when the text parses, so mid-edit invalid JSON doesn't fight the keystrokes. An
// external change to the value reloads the buffer; the serialized-value dep makes
// that fire on real content changes only, not on our own commits. Exported so
// plugins can reuse it as the fallback editor for values they don't structure.

const rawStyle: CSSProperties = {
  ...inputStyle,
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  minHeight: 64,
  resize: 'vertical',
  width: '100%',
  boxSizing: 'border-box',
};

const showJson = (value: unknown): string => JSON.stringify(value ?? null, null, 2);

export const JsonEditor: FC<{ value: unknown; onChange: (value: unknown) => void }> = ({ value, onChange }) => {
  const [text, setText] = useState(() => showJson(value));
  const [valid, setValid] = useState(true);
  const serialized = JSON.stringify(value ?? null);

  useEffect(() => {
    // Adopt the value only when it differs from what the buffer already holds,
    // so an external edit reloads it but our own committed edits don't churn it.
    let mine: unknown;
    try {
      mine = JSON.parse(text);
    } catch {
      setText(showJson(value));
      setValid(true);
      return;
    }
    if (JSON.stringify(mine ?? null) !== serialized) {
      setText(showJson(value));
      setValid(true);
    }
    // Keyed on the serialized value: runs only when the value's content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  return (
    <textarea
      value={text}
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        try {
          const parsed: unknown = JSON.parse(next);
          setValid(true);
          onChange(parsed);
        } catch {
          setValid(false);
        }
      }}
      style={valid ? rawStyle : { ...rawStyle, borderColor: '#dc2626', background: '#fef2f2' }}
    />
  );
};
