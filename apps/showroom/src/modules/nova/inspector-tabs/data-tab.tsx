import type { CSSProperties, ChangeEvent, FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { PublicActionRuntime } from '@niscorp/nova';
import { useRuntimeView } from '../runtime-context';

const LEGEND_STYLE: CSSProperties = {
  padding: '12px 16px',
  background: '#f3f4f6',
  color: '#4b5563',
  fontSize: 11,
  borderBottom: '1px solid #e5e7eb',
  fontStyle: 'italic',
};

const PRE_STYLE: CSSProperties = {
  margin: 0,
  padding: 16,
  fontSize: 11,
  fontFamily: 'ui-monospace, Menlo, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const TEXTAREA_STYLE: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 240,
  boxSizing: 'border-box',
  margin: 0,
  padding: 16,
  fontSize: 11,
  fontFamily: 'ui-monospace, Menlo, monospace',
  border: 'none',
  borderBottom: '1px solid #e5e7eb',
  outline: 'none',
  resize: 'vertical',
  background: '#ffffff',
  color: '#111827',
};

const STATUS_STYLE: CSSProperties = {
  padding: '8px 16px',
  fontSize: 11,
  fontFamily: 'ui-monospace, Menlo, monospace',
};

const READ_ONLY_NOTE_STYLE: CSSProperties = {
  padding: '8px 16px',
  fontSize: 11,
  color: '#6b7280',
  fontStyle: 'italic',
  borderBottom: '1px solid #e5e7eb',
  background: '#fafafa',
};

type ParseStatus = { ok: true } | { ok: false; message: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const formatData = (data: Record<string, unknown>): string =>
  JSON.stringify(data, null, 2);

type EditableDataTabProps = {
  runtime: PublicActionRuntime;
  data: Record<string, unknown>;
};

const EditableDataTab: FC<EditableDataTabProps> = ({ runtime, data }) => {
  const [text, setText] = useState<string>(() => formatData(data));
  const [status, setStatus] = useState<ParseStatus>({ ok: true });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    const hasFocus = el !== null && document.activeElement === el;
    if (hasFocus) return;
    setText(formatData(data));
    setStatus({ ok: true });
  }, [data]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const next = event.target.value;
    setText(next);
    try {
      const parsed: unknown = JSON.parse(next);
      if (!isPlainObject(parsed)) {
        setStatus({ ok: false, message: 'Must be a plain object' });
        return;
      }
      runtime.setData(parsed);
      setStatus({ ok: true });
    } catch {
      setStatus({ ok: false, message: 'Invalid JSON' });
    }
  };

  return (
    <div>
      <div style={LEGEND_STYLE}>
        The data object the layout reads from. Edit the JSON below and the canvas will update live.
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        spellCheck={false}
        style={TEXTAREA_STYLE}
      />
      <div
        style={{
          ...STATUS_STYLE,
          color: status.ok ? '#166534' : '#991b1b',
          background: status.ok ? '#f0fdf4' : '#fef2f2',
        }}
      >
        {status.ok ? '\u2713 Synced' : `\u2717 ${status.message}`}
      </div>
    </div>
  );
};

export const DataTab: FC = () => {
  const view = useRuntimeView();
  const data = view?.data ?? {};
  const runtime = view?.runtime;

  if (runtime !== undefined) {
    return <EditableDataTab runtime={runtime} data={data} />;
  }

  return (
    <div>
      <div style={LEGEND_STYLE}>
        The data object the layout reads from. Path expressions like `$.user.name` resolve against
        this tree.
      </div>
      <div style={READ_ONLY_NOTE_STYLE}>Edit not available for layout stories yet.</div>
      <pre style={PRE_STYLE}>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
};
