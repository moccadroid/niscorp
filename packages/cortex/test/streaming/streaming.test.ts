import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { defineTool } from '../../src/tool/define-tool';
import { runAgentStandalone } from '../../src/agent/standalone';
import { CortexTopics, type LlmDeltaPayload } from '../../src/topics';
import { createStubSignal } from '../_helpers/stub-signal';

// ═══════════════════════════════════════════════════════════
// Tool-loop streaming — delta emission, payload forwarding,
// iteration indexing, and mid-stream abort.
// ═══════════════════════════════════════════════════════════

describe('tool loop — streaming', () => {
  it('emits cortex.llm.delta per text chunk with workflow/agent/tick/iteration', async () => {
    const llm = createStubSignal([
      { content: 'hello world', chunks: ['hello', ' ', 'world'] },
    ]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'streamer',
        name: 'S',
        description: 'streams',
        instructions: '',
        outputMode: 'text',
      }),
    );

    const deltas: LlmDeltaPayload[] = [];
    m.bus.on(CortexTopics.llmDelta, (e) => deltas.push(e.payload));

    const result = await m.execute('streamer', 'hi', { stream: true });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('hello world');

    expect(deltas.map((d) => d.text)).toEqual(['hello', ' ', 'world']);
    for (const d of deltas) {
      expect(d.agentId).toBe('streamer');
      expect(d.iteration).toBe(0);
      expect(d.tick).toBe(0);
      expect(typeof d.workflowId).toBe('string');
    }
    expect(llm.streamCalls).toHaveLength(1);
    expect(llm.calls).toHaveLength(0);
  });

  it('does not emit deltas when stream: false (default)', async () => {
    const llm = createStubSignal([{ content: 'hi there' }]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'nostream',
        name: 'N',
        description: '',
        instructions: '',
        outputMode: 'text',
      }),
    );

    const deltas: LlmDeltaPayload[] = [];
    m.bus.on(CortexTopics.llmDelta, (e) => deltas.push(e.payload));

    const result = await m.execute('nostream', 'hi');
    expect(result.ok).toBe(true);
    expect(deltas).toHaveLength(0);
    expect(llm.calls).toHaveLength(1);
    expect(llm.streamCalls).toHaveLength(0);
  });

  it('streams across tool-loop iterations with iteration indices 0, 1, …', async () => {
    const llm = createStubSignal([
      {
        content: 'let me look',
        chunks: ['let', ' me', ' look'],
        toolCalls: [{ id: 'c1', name: 'lookup', args: { key: 'x' } }],
      },
      { content: 'the answer', chunks: ['the', ' answer'] },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'lookup',
        name: 'lookup',
        description: 'lookup',
        input: z.object({ key: z.string() }),
        execute: async ({ key }) => ({ value: `v-${key}` }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'ranger',
        name: 'R',
        description: '',
        instructions: '',
        outputMode: 'text',
        tools: ['lookup'],
      }),
    );

    const deltas: LlmDeltaPayload[] = [];
    m.bus.on(CortexTopics.llmDelta, (e) => deltas.push(e.payload));

    const result = await m.execute('ranger', 'go', { stream: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('the answer');

    const byIteration = deltas.reduce<Record<number, string[]>>((acc, d) => {
      acc[d.iteration] = (acc[d.iteration] ?? []).concat(d.text);
      return acc;
    }, {});
    expect(byIteration[0]).toEqual(['let', ' me', ' look']);
    expect(byIteration[1]).toEqual(['the', ' answer']);
    expect(llm.streamCalls).toHaveLength(2);
  });

  it('forwards the stream flag through the executeRequested bus payload', async () => {
    // If forwarding regresses, the workflow-context never sees the flag
    // and the tool loop silently falls back to step().
    const llm = createStubSignal([{ content: 'ok' }, { content: 'ok' }]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'forwarder',
        name: 'F',
        description: '',
        instructions: '',
        outputMode: 'text',
      }),
    );

    const observed: Array<boolean | undefined> = [];
    m.bus.on(CortexTopics.executeRequested, (e) => {
      observed.push(e.payload.stream);
    });

    await m.execute('forwarder', 'go', { stream: true });
    await m.execute('forwarder', 'go');

    expect(observed).toEqual([true, undefined]);
  });

  it('aborts the stream mid-iteration when the workflow abort fires', async () => {
    const llm = createStubSignal([
      { content: 'one two three four', chunks: ['one', ' two', ' three', ' four'] },
    ]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'aborter',
        name: 'A',
        description: '',
        instructions: '',
        outputMode: 'text',
      }),
    );

    const deltas: LlmDeltaPayload[] = [];
    m.bus.on(CortexTopics.llmDelta, (e) => {
      deltas.push(e.payload);
      // Aborting via the workflow mirrors any mid-stream stop
      // (rule effect, deadline, external cancel).
      const wf = m._internal.workflows.get(e.payload.workflowId);
      wf?.abort.abort('test');
    });

    const result = await m.execute('aborter', 'go', { stream: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('aborted');
    expect(deltas.map((d) => d.text)).toEqual(['one']);
  });
});

// ═══════════════════════════════════════════════════════════
// Agent-level streaming — text, structured, plan, retry.
// ═══════════════════════════════════════════════════════════

describe('runAgentStandalone — streaming', () => {
  it('streams a text-mode agent end-to-end', async () => {
    const llm = createStubSignal([
      { content: 'one two three', chunks: ['one', ' two', ' three'] },
    ]);
    const deltas: LlmDeltaPayload[] = [];
    const result = await runAgentStandalone(
      defineAgent({
        id: 'text-streamer',
        name: 'TS',
        description: '',
        instructions: '',
        outputMode: 'text',
      }),
      'hi',
      {
        llm,
        stream: true,
        onBus: (bus) => {
          bus.on(CortexTopics.llmDelta, (e) => deltas.push(e.payload));
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('one two three');
    expect(deltas.map((d) => d.text)).toEqual(['one', ' two', ' three']);
  });

  it('streams a structured-mode agent and validates the accumulated response', async () => {
    const json = '{"name":"max","score":42}';
    const llm = createStubSignal([
      // Split at intentional JSON boundaries, not byte offsets.
      { content: json, chunks: ['{"name":"max",', '"score":42}'] },
    ]);
    const deltas: LlmDeltaPayload[] = [];
    const schema = z.object({ name: z.string(), score: z.number() });
    const result = await runAgentStandalone<z.infer<typeof schema>>(
      defineAgent({
        id: 'struct-streamer',
        name: 'SS',
        description: '',
        instructions: 'Return JSON.',
        outputMode: 'structured',
        outputSchema: schema,
      }),
      'go',
      {
        llm,
        stream: true,
        onBus: (bus) => {
          bus.on(CortexTopics.llmDelta, (e) => deltas.push(e.payload));
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: 'max', score: 42 });
    expect(deltas.map((d) => d.text)).toEqual(['{"name":"max",', '"score":42}']);
  });

  it('fires cortex.agent.retry between delta batches on structured validation retry', async () => {
    // Streaming consumers reset their partial-output accumulator on
    // cortex.agent.retry. The retry event MUST land between the failed
    // attempt's deltas and the next attempt's deltas.
    const valid = '{"name":"ok","score":1}';
    const llm = createStubSignal([
      { content: 'not json', chunks: ['not', ' json'] },
      { content: valid, chunks: [valid] },
    ]);
    const events: Array<
      | { kind: 'delta'; text: string }
      | { kind: 'retry'; attempt: number }
    > = [];
    const schema = z.object({ name: z.string(), score: z.number() });
    const result = await runAgentStandalone<z.infer<typeof schema>>(
      defineAgent({
        id: 'retry-streamer',
        name: 'RS',
        description: '',
        instructions: 'Return JSON.',
        outputMode: 'structured',
        outputSchema: schema,
      }),
      'go',
      {
        llm,
        stream: true,
        onBus: (bus) => {
          bus.on(CortexTopics.llmDelta, (e) =>
            events.push({ kind: 'delta', text: e.payload.text }));
          bus.on(CortexTopics.agentRetry, (e) =>
            events.push({ kind: 'retry', attempt: e.payload.attempt }));
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: 'ok', score: 1 });
    expect(events).toEqual([
      { kind: 'delta', text: 'not' },
      { kind: 'delta', text: ' json' },
      { kind: 'retry', attempt: 1 },
      { kind: 'delta', text: valid },
    ]);
  });

  it('streams a plan-mode agent per tick, carrying the correct tick in each delta', async () => {
    // Chunks are split at semantic JSON boundaries — the opening `[`
    // and the node body — not byte offsets. The full chunk sequence
    // per tick reassembles to valid plan JSON.
    const plan0Chunks = ['[', '{"kind":"use_tool","toolId":"echo","input":{"v":"one"}}]'];
    const plan1Chunks = ['[', '{"kind":"final","result":"done"}]'];
    const plan0 = plan0Chunks.join('');
    const plan1 = plan1Chunks.join('');
    const llm = createStubSignal([
      { content: plan0, chunks: plan0Chunks },
      { content: plan1, chunks: plan1Chunks },
    ]);
    const events: Array<{ tick: number; text: string }> = [];

    const result = await runAgentStandalone(
      defineAgent({
        id: 'plan-streamer',
        name: 'PS',
        description: '',
        instructions: 'Plan.',
        outputMode: 'plan',
      }),
      'go',
      {
        llm,
        stream: true,
        tools: [
          defineTool({
            id: 'echo',
            name: 'echo',
            description: 'echo',
            input: z.object({ v: z.string() }),
            execute: async ({ v }) => ({ v }),
          }),
        ],
        onBus: (bus) => {
          bus.on(CortexTopics.llmDelta, (e) =>
            events.push({ tick: e.payload.tick, text: e.payload.text }));
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('done');

    const tick0 = events.filter((e) => e.tick === 0).map((e) => e.text).join('');
    const tick1 = events.filter((e) => e.tick === 1).map((e) => e.text).join('');
    expect(tick0).toBe(plan0);
    expect(tick1).toBe(plan1);
  });

  it('default (no stream flag) runs through step() — no deltas emitted', async () => {
    const llm = createStubSignal([{ content: 'quiet' }]);
    const deltas: LlmDeltaPayload[] = [];
    const result = await runAgentStandalone(
      defineAgent({
        id: 'quiet',
        name: 'Q',
        description: '',
        instructions: '',
        outputMode: 'text',
      }),
      'hi',
      {
        llm,
        onBus: (bus) => {
          bus.on(CortexTopics.llmDelta, (e) => deltas.push(e.payload));
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(deltas).toHaveLength(0);
    expect(llm.calls).toHaveLength(1);
    expect(llm.streamCalls).toHaveLength(0);
  });
});
