import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { defineTool } from '../../src/tool/define-tool';
import { createStubSignal } from '../_helpers/stub-signal';

// ═══════════════════════════════════════════════════════════
// Bug 2 regression: tool loop must send real assistant{tool_calls}
// + tool{result} message turns to signal.step() on subsequent
// iterations, not rely on a system-note observations producer.
//
// This is the OpenAI tool-calling contract — every model is trained
// on it. Without it, multi-step tool use degrades into the model
// re-calling the same tools because it never sees its own previous
// turn or the tool results in the expected format.
// ═══════════════════════════════════════════════════════════

describe('tool message flow — runningMessages accumulator', () => {
  it('appends assistant{toolCalls} + tool{result} to the next iteration', async () => {
    const llm = createStubSignal([
      // Iteration 1: model calls get_weather for Berlin
      {
        content: '',
        toolCalls: [{ id: 'call_b', name: 'get_weather', args: { city: 'Berlin' } }],
      },
      // Iteration 2: model finalizes (we inspect what messages it received)
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

    // Iteration 2 must contain:
    //   1. The pipeline prefix (system, tools, user)
    //   2. The assistant message from iteration 1, WITH tool_calls
    //   3. A tool message keyed by the matching id
    const secondCallMessages = llm.calls[1]?.messages ?? [];

    const assistantWithTools = secondCallMessages.find(
      (m) => m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0,
    );
    expect(assistantWithTools).toBeDefined();
    if (!assistantWithTools || assistantWithTools.role !== 'assistant') return;
    expect(assistantWithTools.toolCalls).toHaveLength(1);
    const tc = assistantWithTools.toolCalls?.[0];
    expect(tc?.id).toBe('call_b');
    expect(tc?.name).toBe('get_weather');
    // Args are stringified JSON in the assistant message (per the
    // OpenAI tool-calling contract).
    expect(typeof tc?.args).toBe('string');
    expect(tc?.args && JSON.parse(tc.args)).toEqual({ city: 'Berlin' });

    const toolMessage = secondCallMessages.find((m) => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    if (!toolMessage || toolMessage.role !== 'tool') return;
    expect(toolMessage.toolCallId).toBe('call_b');
    expect(toolMessage.name).toBe('get_weather');
    // Tool message content is a string. The result {city,tempC,condition}
    // gets JSON-stringified.
    const parsed = JSON.parse(toolMessage.content);
    expect(parsed).toEqual({ city: 'Berlin', tempC: 4, condition: 'overcast' });
  });

  it('handles multiple tool calls in one assistant turn', async () => {
    const llm = createStubSignal([
      // Iteration 1: model calls TWO tools in parallel (one assistant turn)
      {
        content: '',
        toolCalls: [
          { id: 'call_b', name: 'get_weather', args: { city: 'Berlin' } },
          { id: 'call_p', name: 'get_weather', args: { city: 'Paris' } },
        ],
      },
      // Iteration 2: model finalizes
      { content: '{"reports":[]}' },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'get_weather',
        name: 'get_weather',
        description: 'returns weather',
        input: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ city, tempC: 0, condition: 'x' }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'weather',
        name: 'W',
        description: '',
        instructions: '',
        outputMode: 'structured',
        outputSchema: z.object({ reports: z.array(z.unknown()) }),
        tools: ['get_weather'],
      }),
    );
    await m.execute('weather', 'go');

    // Iteration 2 must contain the assistant message with BOTH tool
    // calls and TWO tool result messages, in the right order.
    const messages = llm.calls[1]?.messages ?? [];
    const assistantTurn = messages.find(
      (m) => m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length === 2,
    );
    expect(assistantTurn).toBeDefined();
    const toolMessages = messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(2);
    if (toolMessages[0]?.role !== 'tool' || toolMessages[1]?.role !== 'tool') return;
    expect([toolMessages[0].toolCallId, toolMessages[1].toolCallId].sort()).toEqual(
      ['call_b', 'call_p'].sort(),
    );
  });
});
