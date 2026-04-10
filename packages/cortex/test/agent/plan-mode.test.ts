import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { defineTool } from '../../src/tool/define-tool';
import { createStubSignal } from '../_helpers/stub-signal';
import type { ActionPlan } from '../../src/schemas';

const planJson = (plan: ActionPlan): string => JSON.stringify(plan);

describe('Plan-mode agent — basic finalization', () => {
  it('finalizes immediately when the planner returns a single final node', async () => {
    const llm = createStubSignal([
      { content: planJson([{ kind: 'final', result: { msg: 'done' } }]) },
    ]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'planner',
        name: 'Planner',
        description: 'plans',
        instructions: 'Plan and finalize.',
        outputMode: 'plan',
      }),
    );
    const result = await m.execute('planner', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ msg: 'done' });
  });

  it('runs multiple ticks until a final lands', async () => {
    const llm = createStubSignal([
      // tick 0: a tool call, no final
      {
        content: planJson([
          { kind: 'use_tool', toolId: 'echo', input: { value: 'first' } },
        ]),
      },
      // tick 1: another tool call, no final
      {
        content: planJson([
          { kind: 'use_tool', toolId: 'echo', input: { value: 'second' } },
        ]),
      },
      // tick 2: final
      { content: planJson([{ kind: 'final', result: 'all done' }]) },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'echo',
        name: 'echo',
        description: 'echo',
        input: z.object({ value: z.string() }),
        execute: async ({ value }) => ({ echoed: value }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'p',
        name: 'P',
        description: 'p',
        instructions: '',
        outputMode: 'plan',
      }),
    );
    const result = await m.execute('p', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('all done');
  });

  it('returns ticks_exceeded when the planner never finalizes', async () => {
    const llm = createStubSignal();
    for (let i = 0; i < 30; i += 1) {
      llm.enqueue({
        content: planJson([{ kind: 'use_tool', toolId: 'echo', input: { value: `${i}` } }]),
      });
    }
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'echo',
        name: 'echo',
        description: 'echo',
        input: z.object({ value: z.string() }),
        execute: async ({ value }) => value,
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'p',
        name: 'P',
        description: 'p',
        instructions: '',
        outputMode: 'plan',
        // maxTicks is the outer tick loop cap (plan mode only).
        
        maxTicks: 3,
      }),
    );
    const result = await m.execute('p', 'go');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ticks_exceeded');
  });

  it('rejects plans that exceed maxPlanDepth via plan_depth_exceeded', async () => {
    // Default maxPlanDepth=2. Three nested parallels = depth 3 > 2.
    const deep: ActionPlan = [
      {
        kind: 'parallel',
        branches: [
          {
            kind: 'parallel',
            branches: [
              {
                kind: 'parallel',
                branches: [{ kind: 'final', result: 'too deep' }],
              },
            ],
          },
        ],
      },
    ];
    const llm = createStubSignal([{ content: planJson(deep) }]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'deep',
        name: 'D',
        description: 'd',
        instructions: '',
        outputMode: 'plan',
      }),
    );
    const result = await m.execute('deep', 'go');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('plan_depth_exceeded');
  });
});

describe('ask_agent delegation', () => {
  it('delegates to a specialist and uses the specialist result', async () => {
    // Director: emits a single ask_agent then a final on the next tick.
    // Specialist: text-mode agent, returns "SUMMARY"
    const llm = createStubSignal([
      // tick 0 of director: ask the specialist
      { content: planJson([{ kind: 'ask_agent', agentId: 'spec', input: 'work' }]) },
      // specialist's only call: returns text
      { content: 'SUMMARY' },
      // tick 1 of director: final (now sees the observation in context)
      { content: planJson([{ kind: 'final', result: 'all good' }]) },
    ]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'spec',
        name: 'spec',
        description: 's',
        instructions: 'be brief',
        outputMode: 'text',
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'director',
        name: 'director',
        description: 'd',
        instructions: '',
        outputMode: 'plan',
      }),
    );
    const result = await m.execute('director', 'do it');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('all good');
  });

  it('records an error observation when delegating to an unknown agent', async () => {
    const llm = createStubSignal([
      { content: planJson([{ kind: 'ask_agent', agentId: 'missing', input: '' }]) },
      { content: planJson([{ kind: 'final', result: 'recovered' }]) },
    ]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'd',
        name: 'd',
        description: 'd',
        instructions: '',
        outputMode: 'plan',
      }),
    );
    const result = await m.execute('d', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('recovered');
  });
});

describe('parallel branches', () => {
  it('runs branches and lets the planner finalize on the next tick', async () => {
    const llm = createStubSignal([
      // tick 0: parallel of two tool calls
      {
        content: planJson([
          {
            kind: 'parallel',
            branches: [
              { kind: 'use_tool', toolId: 't', input: { x: 'a' } },
              { kind: 'use_tool', toolId: 't', input: { x: 'b' } },
            ],
          },
        ]),
      },
      // tick 1: final
      { content: planJson([{ kind: 'final', result: 'merged' }]) },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 't',
        name: 't',
        description: 't',
        input: z.object({ x: z.string() }),
        execute: async ({ x }) => `got ${x}`,
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'p',
        name: 'p',
        description: 'p',
        instructions: '',
        outputMode: 'plan',
      }),
    );
    const result = await m.execute('p', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('merged');
  });
});

describe('reflect + tell_topic', () => {
  it('reflect writes to scratch state and tell_topic emits an event', async () => {
    const llm = createStubSignal([
      {
        content: planJson([
          { kind: 'reflect', content: 'thinking about it' },
          { kind: 'tell_topic', topic: 'demo.poke', payload: { hello: 1 } },
          { kind: 'final', result: 'ok' },
        ]),
      },
    ]);
    const m = createManifold({ llm });
    let pokeCount = 0;
    m.bus.on('demo.poke', () => {
      pokeCount += 1;
    });
    m.registerAgent(
      defineAgent({
        id: 'p',
        name: 'p',
        description: 'p',
        instructions: '',
        outputMode: 'plan',
      }),
    );
    const result = await m.execute('p', 'go');
    expect(result.ok).toBe(true);
    expect(pokeCount).toBe(1);
  });
});

describe('plan-mode + policy gate', () => {
  it('records gate denials as observations and lets the agent recover on the next tick', async () => {
    const llm = createStubSignal([
      // tick 0: try a denied tool
      {
        content: planJson([{ kind: 'use_tool', toolId: 'denied.tool', input: {} }]),
      },
      // tick 1: final after seeing the denial observation
      { content: planJson([{ kind: 'final', result: 'recovered' }]) },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'denied.tool',
        name: 'denied',
        description: 'd',
        input: z.object({}),
        execute: async () => null,
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'p',
        name: 'p',
        description: 'p',
        instructions: '',
        outputMode: 'plan',
        policy: { tools: { deny: ['denied.tool'] } },
      }),
    );
    const result = await m.execute('p', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('recovered');
  });
});
