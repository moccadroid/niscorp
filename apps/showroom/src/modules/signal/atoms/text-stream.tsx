import type { FC } from 'react';

type Props = {
  text: string;
  streaming: boolean;
};

// Dark monospace pane that renders accumulating stream text.
// Shows a blinking cursor and a blue border while streaming;
// a subtle "Waiting…" placeholder when empty and idle.
export const TextStream: FC<Props> = ({ text, streaming }) => (
  <div
    style={{
      background: '#1e1e1e',
      color: '#d4d4d4',
      borderRadius: 8,
      padding: 16,
      fontSize: 13,
      fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
      lineHeight: 1.6,
      minHeight: 80,
      maxHeight: 500,
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      border: streaming ? '2px solid #2563eb' : '2px solid transparent',
      transition: 'border-color 200ms',
    }}
  >
    {text || (streaming ? '' : 'Waiting…')}
    {streaming && <span style={{ color: '#6b7280' }}>▌</span>}
  </div>
);
