import type { FC, ReactNode } from 'react';
import { z } from 'zod';
import type { RecipeStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Setup tab — the configuration the recipe was built with.
// Shows provider/model/system prompt prominently, and reveals
// the JSON schemas of any tools and the output schema. The
// schemas are the most important part of a recipe and the
// runner can't show them in the chat thread.
// ═══════════════════════════════════════════════════════════

const LEGEND =
  'Configuration for this recipe: provider, model, system prompt, tools (with input schemas), and output schema if any.';

type Props = { story: RecipeStory };

const Section: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div
      style={{
        padding: '6px 16px',
        fontSize: 11,
        fontWeight: 700,
        color: '#374151',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        background: '#f9fafb',
        borderTop: '1px solid #e5e7eb',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
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
  <pre
    style={{
      margin: 0,
      padding: 12,
      background: '#1e1e1e',
      color: '#d4d4d4',
      borderRadius: 6,
      fontSize: 11.5,
      fontFamily: 'ui-monospace, Menlo, monospace',
      overflow: 'auto',
      lineHeight: 1.6,
    }}
  >
    {children}
  </pre>
);

// Convert a Zod schema to a JSON-Schema (draft-7) string for display.
// Failures fall back to the schema's typeName so the user at least sees
// something instead of "(zod schema)".
const schemaToJsonString = (schema: z.ZodTypeAny): string => {
  try {
    const json = z.toJSONSchema(schema, { target: 'draft-7' });
    return JSON.stringify(json, null, 2);
  } catch {
    return '(unable to serialize schema)';
  }
};

export const SetupTab: FC<Props> = ({ story }) => {
  const setup = story.setup;
  return (
    <div>
      <div
        style={{
          padding: '12px 16px',
          background: '#f3f4f6',
          color: '#4b5563',
          fontSize: 11,
          borderBottom: '1px solid #e5e7eb',
          fontStyle: 'italic',
        }}
      >
        {LEGEND}
      </div>

      <Section title="Provider">
        <KV k="provider" v={setup.provider} />
        <KV k="model" v={setup.model ?? '(provider default)'} />
      </Section>

      {setup.systemPrompt !== undefined && (
        <Section title="System prompt">
          <div
            style={{
              padding: 10,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              fontSize: 12,
              fontStyle: 'italic',
              color: '#1f2937',
              whiteSpace: 'pre-wrap',
            }}
          >
            "{setup.systemPrompt}"
          </div>
        </Section>
      )}

      {setup.tools !== undefined && setup.tools.length > 0 && (
        <Section title={`Tools (${setup.tools.length})`}>
          {setup.tools.map((tool) => (
            <div key={tool.name} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <strong style={{ color: '#111827' }}>{tool.name}</strong>{' '}
                <span style={{ color: '#6b7280', fontStyle: 'italic' }}>{tool.description}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                INPUT SCHEMA
              </div>
              <Mono>{schemaToJsonString(tool.inputSchema)}</Mono>
            </div>
          ))}
        </Section>
      )}

      {setup.schema !== undefined && (
        <Section title="Output schema">
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            Signal constrains the model's response to match this schema. The result is fully typed and validated.
          </div>
          <Mono>{schemaToJsonString(setup.schema)}</Mono>
        </Section>
      )}

      {setup.options !== undefined && (
        <Section title="Options">
          <Mono>{JSON.stringify(setup.options, null, 2)}</Mono>
        </Section>
      )}
    </div>
  );
};
