import { useState, type CSSProperties } from 'react';
import { z } from 'zod';
import { defineAgent, defineTool, type ResolvedPreview } from '@niscorp/cortex';
import { buildLlm } from '../llm';

// preview(): the exact messages and tools a run would send — no model
// call, no key required. It shows the REAL respond-tool params and the
// resolved strategy, so output plumbing is never mystery-meat.
// Anything you can't explain in the preview, the model can't either.

const search = defineTool({
  id: 'search',
  name: 'search',
  description: 'Searches the product catalog.',
  input: z.object({ query: z.string() }),
  execute: ({ query }) => `results for ${query}`,
});

const agent = defineAgent({
  id: 'demo.preview',
  description: 'A product finder.',
  instructions: 'Find products with the search tool, then respond with the best match.',
  tools: [search],
  output: { schema: z.object({ product: z.string(), price: z.number() }) },
});

const mono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 12 };

export const Demo = () => {
  const [preview, setPreview] = useState<ResolvedPreview | undefined>(undefined);

  const load = async (): Promise<void> => {
    const llm = buildLlm(); // optional — without a key, resolution assumes a conservative provider
    setPreview(await agent.preview('a quiet mechanical keyboard under 100', llm ? { llm } : {}));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
      <div>
        <button onClick={() => void load()} style={{ padding: '8px 16px' }}>
          Preview the run
        </button>
      </div>
      {preview && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 340px', minWidth: 300 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.6, marginBottom: 6 }}>
              strategy: {preview.strategy}
              {preview.respondDetail !== undefined && ` (${preview.respondDetail} params)`} · ~{preview.estimatedTokens} tokens
            </div>
            <pre style={{ ...mono, border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: 12, overflow: 'auto', maxHeight: 380 }}>
              {preview.messages.map((m) => `[${m.role}]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n')}
            </pre>
          </div>
          <div style={{ flex: '1 1 340px', minWidth: 300 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.6, marginBottom: 6 }}>
              tools the model sees (incl. respond)
            </div>
            <pre style={{ ...mono, border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: 12, overflow: 'auto', maxHeight: 380 }}>
              {JSON.stringify(preview.tools, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
