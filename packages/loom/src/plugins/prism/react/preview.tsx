import type { CSSProperties, FC } from 'react';
import type { NovaComponent } from '@niscorp/nova/react';
import { ConfigSchema, evaluateSafe, type JsonObject } from '@niscorp/prism';

// The preview component: applies the edited config to the sample input and shows
// the output (or the error). Registered under PREVIEW; the plugin's mount binds
// the live config to it. Closes over the host's `input`.

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const Note: FC<{ children: string }> = ({ children }) => (
  <div style={{ fontSize: 13, color: '#6b7280', padding: 12 }}>{children}</div>
);

const jsonStyle = (tone: 'plain' | 'muted' | 'error'): CSSProperties => ({
  margin: 0,
  padding: 12,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: mono,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 320,
  overflow: 'auto',
  border: '1px solid #e5e7eb',
  background: tone === 'error' ? '#fef2f2' : tone === 'muted' ? '#f9fafb' : '#ffffff',
  color: tone === 'error' ? '#991b1b' : '#1f2937',
});

const head: CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', margin: '0 0 4px' };

const Panel: FC<{ label: string; tone?: 'plain' | 'muted' | 'error'; children: string }> = ({ label, tone = 'plain', children }) => (
  <div>
    <div style={head}>{label}</div>
    <pre style={jsonStyle(tone)}>{children}</pre>
  </div>
);

const show = (value: unknown): string => JSON.stringify(value, null, 2);

export const makePreview = (input: JsonObject): NovaComponent<{ config?: unknown }> => {
  const Preview: FC<{ config?: unknown }> = ({ config }) => {
    if (config === null || config === undefined) return <Note>Edit the config to see its output.</Note>;

    const parsed = ConfigSchema.safeParse(config);
    const result = parsed.success ? evaluateSafe(parsed.data, input) : undefined;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Panel label="Input" tone="muted">{show(input)}</Panel>
        {!parsed.success ? (
          <Panel label="Output" tone="error">{parsed.error.message}</Panel>
        ) : result !== undefined && result.ok ? (
          <Panel label="Output">{show(result.data)}</Panel>
        ) : (
          <Panel label="Output" tone="error">{result !== undefined && !result.ok ? result.error.message : ''}</Panel>
        )}
      </div>
    );
  };
  return Preview;
};
