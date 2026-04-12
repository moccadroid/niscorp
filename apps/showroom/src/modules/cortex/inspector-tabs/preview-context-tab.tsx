import { useCallback, useEffect, useState, type FC } from 'react';
import {
  createManifold,
  type ResolvedContext,
  type ResolvedChunk,
  type AgentDefinition,
  type ToolDefinition,
} from '@niscorp/cortex';
import {
  isCortexStory,
  isPrismMappingStory,
  isStructuredExtractStory,
  isToolUseStory,
  isPlanModeStory,
  isRulesStory,
  type CortexStory,
} from '../story-types';
import { mappingAgent } from '@niscorp/prism/agent';

// ═══════════════════════════════════════════════════════════
// Preview Context tab
// ═══════════════════════════════════════════════════════════
//
// Cortex's killer debugging feature: see exactly what the model
// will see *before* sending the call. We build an ephemeral manifold,
// register the story's agent + tools, and call manifold.previewContext()
// — same path the runtime uses to assemble the prompt — then render
// the resolved chunks with their sources, token counts, and which
// ones got evicted under budget pressure.
//
// No LLM call. No API key needed. Pure introspection.

type ResolveStory = {
  agent: AgentDefinition<unknown>;
  tools: ReadonlyArray<ToolDefinition>;
  input: unknown;
};

const resolveStory = (story: CortexStory): ResolveStory | undefined => {
  if (isPrismMappingStory(story)) {
    return {
      agent: mappingAgent,
      tools: [],
      input: {
        sampleInput: story.sampleInput,
        targetShape: story.expected,
        ...(story.fieldDescriptions && { fieldDescriptions: story.fieldDescriptions }),
        ...(story.notes && { notes: story.notes }),
      },
    };
  }
  if (isStructuredExtractStory(story)) {
    return { agent: story.agent, tools: [], input: story.inputText };
  }
  if (isToolUseStory(story)) {
    return { agent: story.agent, tools: story.tools, input: story.prompt };
  }
  if (isPlanModeStory(story)) {
    return { agent: story.agent, tools: story.tools ?? [], input: story.prompt };
  }
  if (isRulesStory(story)) {
    return { agent: story.agent, tools: story.tools ?? [], input: story.prompt };
  }
  return undefined;
};

type Props = { story: unknown };

export const PreviewContextTab: FC<Props> = ({ story }) => {
  const [resolved, setResolved] = useState<ResolvedContext | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // Auto-compute on story change. previewContext is free (no LLM,
  // no API key, sub-10ms) so there's no reason to gate it behind a
  // button. The user sees the resolved context immediately when they
  // switch to a story or open this tab.
  const storyId = isCortexStory(story) ? story.id : undefined;
  useEffect(() => {
    if (!isCortexStory(story)) {
      setResolved(undefined);
      setError(undefined);
      return;
    }
    const resolvedStory = resolveStory(story);
    if (!resolvedStory) {
      setResolved(undefined);
      setError('No agent attached to this story.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    const run = async (): Promise<void> => {
      try {
        const manifold = createManifold({});
        manifold.registerAgent(resolvedStory.agent);
        for (const tool of resolvedStory.tools) manifold.registerTool(tool);
        await manifold.start();
        const result = await manifold.previewContext(resolvedStory.agent.agentId, resolvedStory.input);
        await manifold.stop();
        if (!cancelled) setResolved(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [storyId, story]);

  if (!isCortexStory(story)) {
    return <div style={{ padding: 16, color: '#9ca3af' }}>No story.</div>;
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '10px 14px',
          background: 'linear-gradient(135deg, #ecfeff 0%, #eef2ff 100%)',
          border: '1px solid #c7d2fe',
          borderLeft: '4px solid #6366f1',
          borderRadius: 6,
          fontSize: 12,
          color: '#312e81',
          lineHeight: 1.6,
        }}
      >
        <strong>Cortex previewContext</strong> — see exactly what the model would see, before any LLM call. Cortex
        runs the same context pipeline the runtime uses (gather producers → build chunks → estimate tokens →
        compress → pack to budget → evict low-priority chunks) and returns the resolved context. No API key,
        no cost, no model.
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>Building context…</div>
      )}

      {error !== undefined && (
        <div
          style={{
            padding: 10,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {resolved !== undefined && <ResolvedView resolved={resolved} />}
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Resolved-context renderer
// ───────────────────────────────────────────────────────────

const ResolvedView: FC<{ resolved: ResolvedContext }> = ({ resolved }) => {
  const surviving = resolved.chunks.filter((c) => !c.evicted);
  const evicted = resolved.chunks.filter((c) => c.evicted);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          padding: '8px 12px',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          fontSize: 12,
          color: '#1f2937',
          fontFamily: 'ui-monospace, Menlo, monospace',
        }}
      >
        <strong>{surviving.length}</strong> chunks · <strong>{resolved.totalTokens}</strong> tokens used /{' '}
        <strong>{resolved.budget}</strong> budget
        {evicted.length > 0 && (
          <span style={{ color: '#92400e' }}>
            {' '}
            · <strong>{evicted.length}</strong> evicted
          </span>
        )}
      </div>
      {surviving.map((chunk, i) => (
        <ChunkBlock key={`s-${i}`} chunk={chunk} />
      ))}
      {evicted.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: '#92400e',
              marginTop: 8,
            }}
          >
            Evicted under budget pressure
          </div>
          {evicted.map((chunk, i) => (
            <ChunkBlock key={`e-${i}`} chunk={chunk} evictedTone />
          ))}
        </>
      )}
    </div>
  );
};

const ChunkBlock: FC<{ chunk: ResolvedChunk; evictedTone?: boolean }> = ({ chunk, evictedTone }) => {
  const content = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
  return (
    <div
      style={{
        padding: '8px 12px',
        background: evictedTone ? '#fef3c7' : '#ffffff',
        border: `1px solid ${evictedTone ? '#fde68a' : '#e5e7eb'}`,
        borderRadius: 6,
        fontSize: 11,
        opacity: evictedTone ? 0.7 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 6,
          fontFamily: 'ui-monospace, Menlo, monospace',
          color: '#6b7280',
        }}
      >
        <span style={{ fontWeight: 700, color: '#1f2937' }}>{chunk.role}</span>
        <span>·</span>
        <span>{chunk.source}</span>
        <span>·</span>
        <span>{chunk.tokens ?? '?'}t</span>
        {chunk.tags && chunk.tags.length > 0 && (
          <>
            <span>·</span>
            <span>{chunk.tags.join(', ')}</span>
          </>
        )}
      </div>
      <pre
        style={{
          margin: 0,
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 11,
          color: '#1f2937',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 200,
          overflow: 'auto',
        }}
      >
        {content}
      </pre>
    </div>
  );
};
