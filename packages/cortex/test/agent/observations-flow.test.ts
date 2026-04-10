import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { defineTool } from '../../src/tool/define-tool';
import { createStubSignal } from '../_helpers/stub-signal';

// ═══════════════════════════════════════════════════════════
// Bug 1 regression: structured-mode-with-tools must surface
// observations from the previous loop iteration so the model
// doesn't call the same tool over and over.
//
// This is the bug the weather demo hit in the wild — without
// the observations producer in the default spec, the model saw
// the same prompt every iteration and called get_weather(Berlin)
// 30 times in a row until tool_iterations_exceeded fired.
// ═══════════════════════════════════════════════════════════

describe('structured-mode-with-tools — observation flow between iterations', () => {
  it('passes prior tool call observations into the next iteration\'s prompt', async () => {
    const llm = createStubSignal([
      // Iteration 1: model calls get_weather for Berlin
      { content: '', toolCalls: [{ id: 'c1', name: 'get_weather', args: { city: 'Berlin' } }] },
      // Iteration 2: model finalizes (we'll inspect the messages it received)
      { content: '{"reports":[{"city":"Berlin","tempC":4,"condition":"overcast"}]}' },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'get_weather',
        name: 'get_weather',
        description: 'returns weather',
        input: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ city, tempC: 4, condition: 'overcast' }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'weather',
        name: 'W',
        description: '',
        instructions: 'Return JSON',
        outputMode: 'structured',
        outputSchema: z.object({
          reports: z.array(z.object({ city: z.string(), tempC: z.number(), condition: z.string() })),
        }),
        tools: ['get_weather'],
      }),
    );

    const result = await m.execute('weather', 'weather in Berlin?');
    expect(result.ok).toBe(true);
    expect(llm.calls).toHaveLength(2);

    // The second iteration's messages must surface the prior tool
    // call's observation somewhere — either as a system message from
    // the observations producer, or as a tool-role message (depending
    // on whether bug 2 is fixed). For now (bug 1 only), the
    // observations producer renders it as a system note.
    const secondCallMessages = llm.calls[1]?.messages ?? [];
    const concatenated = secondCallMessages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
    expect(concatenated).toContain('get_weather');
    expect(concatenated).toContain('Berlin');
  });
});
