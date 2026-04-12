import type { FC, ReactNode } from 'react';
import { z } from 'zod';
import type { StreamStory } from '../story-types';

type Props = { story: StreamStory };

const Section: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{
      padding: '6px 16px', fontSize: 11, fontWeight: 700, color: '#374151',
      textTransform: 'uppercase', letterSpacing: 0.5,
      background: '#f9fafb', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb',
    }}>
      {title}
    </div>
    <div style={{ padding: '10px 16px' }}>{children}</div>
  </div>
);

const KV: FC<{ k: string; v: ReactNode }> = ({ k, v }) => (
  <div style={{ display: 'flex', gap: 12, fontSize: 12, lineHeight: 1.8 }}>
    <span style={{ color: '#6b7280', minWidth: 90 }}>{k}</span>
    <span style={{ color: '#1f2937', fontFamily: 'ui-monospace, Menlo, monospace', flex: 1, wordBreak: 'break-word' }}>
      {v}
    </span>
  </div>
);

const Mono: FC<{ children: ReactNode }> = ({ children }) => (
  <pre style={{
    margin: 0, padding: 12, background: '#1e1e1e', color: '#d4d4d4',
    borderRadius: 6, fontSize: 11.5, fontFamily: 'ui-monospace, Menlo, monospace',
    overflow: 'auto', lineHeight: 1.6,
  }}>
    {children}
  </pre>
);

const schemaToJsonString = (schema: z.ZodTypeAny): string => {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7' }), null, 2);
  } catch {
    return '(unable to serialize schema)';
  }
};

export const StreamSetupTab: FC<Props> = ({ story }) => {
  const { setup, solid } = story;
  return (
    <div>
      <div style={{
        padding: '12px 16px', background: '#f3f4f6', color: '#4b5563',
        fontSize: 11, borderBottom: '1px solid #e5e7eb', fontStyle: 'italic',
      }}>
        Streaming configuration: provider, model, schema, and solid integration.
      </div>

      <Section title="Provider">
        <KV k="provider" v={setup.provider} />
        <KV k="model" v={setup.model ?? '(provider default)'} />
        <KV k="mode" v="stream" />
      </Section>

      {setup.systemPrompt !== undefined && (
        <Section title="System prompt">
          <div style={{
            padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb',
            borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: '#1f2937',
            whiteSpace: 'pre-wrap',
          }}>
            &ldquo;{setup.systemPrompt}&rdquo;
          </div>
        </Section>
      )}

      <Section title="User input">
        <div style={{
          padding: 10, background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 6, fontSize: 12, color: '#1e40af', whiteSpace: 'pre-wrap',
        }}>
          {setup.input}
        </div>
      </Section>

      {setup.schema !== undefined && (
        <Section title="Output schema">
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            Signal streams JSON matching this schema. Zod validates at end-of-stream with auto-retry.
          </div>
          <Mono>{schemaToJsonString(setup.schema)}</Mono>
        </Section>
      )}

      {solid !== undefined && (
        <Section title="Solid integration">
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            Text deltas are piped into <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>solid.createStream()</code> for
            live structured rendering with the always-valid invariant.
          </div>
          <KV k="select paths" v={(solid.selectPaths ?? []).join(', ') || '(none)'} />
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
              Initial value
            </div>
            <Mono>{JSON.stringify(solid.initial, null, 2)}</Mono>
          </div>
        </Section>
      )}
    </div>
  );
};
