import type { FC, ReactElement } from 'react';
import { z } from 'zod';
import type { AgentDefinition } from '@niscorp/cortex';
import { mappingAgent } from '@niscorp/prism/agent';
import {
  isCortexStory,
  isPrismMappingStory,
  isStructuredExtractStory,
  isToolUseStory,
  isPlanModeStory,
  type CortexStory,
} from '../story-types';

// ═══════════════════════════════════════════════════════════
// Agent tab — the internals of the Cortex agent driving this demo
// ═══════════════════════════════════════════════════════════
//
// This tab is the *point* of the showroom: we are showing off Cortex,
// not the demo payload. Users should see exactly what `defineAgent`
// call is shipped, including its system prompt, output schema, mode,
// and bounds.
//
// The tab is generic — it takes the AgentDefinition resolved from the
// active story and renders its config. The schema-injection split is
// a small special case for agents (like the Prism mapping agent) that
// inject a runtime-built JSON Schema into their prompt.

const Field: FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#6b7280',
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 12,
        color: '#1f2937',
        fontFamily: mono ? 'ui-monospace, Menlo, monospace' : 'inherit',
      }}
    >
      {value}
    </div>
  </div>
);

const Block: FC<{ label: string; body: string; tone?: 'normal' | 'prompt' }> = ({
  label,
  body,
  tone = 'normal',
}) => {
  const palette =
    tone === 'prompt'
      ? { bg: '#eef2ff', fg: '#1e1b4b', border: '#c7d2fe' }
      : { bg: '#f9fafb', fg: '#1f2937', border: '#e5e7eb' };
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#6b7280',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          background: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.border}`,
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'ui-monospace, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'auto',
          maxHeight: 480,
        }}
      >
        {body}
      </pre>
    </div>
  );
};

// Recognized injection markers — agents that embed runtime-built JSON
// Schemas in their prompt use these so the showroom can split the
// authored part from the injected part. Adding a new marker is the
// only thing required to teach the tab about a new injection.
const SCHEMA_INJECTION_MARKERS: ReadonlyArray<{ marker: string; note: string }> = [
  {
    marker: '═══ Prism Node JSON Schema (the single source of truth) ═══',
    note:
      'Prism Node JSON Schema injected here at runtime via z.toJSONSchema(NodeSchema). Single source of truth — fix the schema, fix the agent.',
  },
];

type SplitPrompt = { authored: string; injectedNote?: string };

const splitPrompt = (instructions: string): SplitPrompt => {
  for (const { marker, note } of SCHEMA_INJECTION_MARKERS) {
    const idx = instructions.indexOf(marker);
    if (idx !== -1) {
      return { authored: instructions.slice(0, idx).trimEnd(), injectedNote: note };
    }
  }
  return { authored: instructions };
};

// ───────────────────────────────────────────────────────────
// Resolve which agent powers this story
// ───────────────────────────────────────────────────────────

const resolveAgent = (story: CortexStory): AgentDefinition<unknown> | undefined => {
  if (isPrismMappingStory(story)) return mappingAgent;
  if (isStructuredExtractStory(story)) return story.agent;
  if (isToolUseStory(story)) return story.agent;
  if (isPlanModeStory(story)) return story.agent;
  return undefined;
};

const renderAgent = (agent: AgentDefinition<unknown>): ReactElement => {
  const config = agent.config;
  const outputSchemaJson = config.outputSchema
    ? z.toJSONSchema(config.outputSchema, { target: 'draft-7' })
    : undefined;
  const { authored, injectedNote } = splitPrompt(config.instructions);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          padding: '12px 14px',
          background: 'linear-gradient(135deg, #eef2ff 0%, #ecfeff 100%)',
          border: '1px solid #c7d2fe',
          borderLeft: '4px solid #6366f1',
          borderRadius: 8,
          fontSize: 12,
          color: '#312e81',
          lineHeight: 1.6,
        }}
      >
        This is the actual <code>defineAgent</code> call the showroom is executing. Cortex feeds the system prompt,
        the registered tools, and the user input through its context pipeline, calls <code>signal.step()</code>,
        and validates the response against the output schema. On validation failure it auto-retries with the prior
        attempt fed back into the prompt.
      </div>

      <Field label="Agent ID" value={config.id} mono />
      <Field label="Name" value={config.name} />
      <Field label="Description" value={config.description} />
      <Field label="Output mode" value={config.outputMode} mono />
      {config.model !== undefined && <Field label="Model override" value={config.model} mono />}
      {config.tools !== undefined && config.tools.length > 0 && (
        <Field label="Tool whitelist" value={config.tools.join(', ')} mono />
      )}
      {config.maxToolIterations !== undefined && (
        <Field label="Max tool iterations" value={String(config.maxToolIterations)} mono />
      )}
      {config.maxOutputRetries !== undefined && (
        <Field label="Max output retries" value={String(config.maxOutputRetries)} mono />
      )}

      <Block label="System prompt (authored)" body={authored} tone="prompt" />

      {injectedNote !== undefined && (
        <div
          style={{
            padding: '10px 14px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderLeft: '4px solid #059669',
            borderRadius: 6,
            fontSize: 12,
            color: '#065f46',
            lineHeight: 1.6,
          }}
        >
          <strong>+ Schema injected here at runtime.</strong> {injectedNote}
        </div>
      )}

      {outputSchemaJson !== undefined && (
        <Block label="Output schema" body={JSON.stringify(outputSchemaJson, null, 2)} />
      )}
    </div>
  );
};

type Props = { story: CortexStory };

export const AgentTab: FC<Props> = ({ story }) => {
  if (!isCortexStory(story)) {
    return <div style={{ padding: 16, color: '#9ca3af' }}>No agent attached.</div>;
  }
  const agent = resolveAgent(story);
  if (!agent) {
    return <div style={{ padding: 16, color: '#9ca3af' }}>No agent for this story kind.</div>;
  }
  return renderAgent(agent);
};
