import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { defineAgent, defineTool } from '../src';
import type { ToolObservation } from '../src';
import { stubSignal } from './helpers/stub-signal';

// WHAT A TOOL'S `input` SCHEMA MAY BE — the README's rule, held to what the
// loop does. Two facts make the rule: the model is sent the schema's
// OUTPUT-side JSON Schema, and a call's arguments are parsed with the schema
// twice (the loop, then defineTool's wrapper in front of `execute`). So an
// input schema validates; it does not convert. Each case below is one way of
// converting, and what it costs. They pin what happens today: a change to any
// of them changes the README's "Errors" section with it.

const callOnce = async (input: ZodType, args: unknown) => {
  const received: unknown[] = [];
  const observations: ToolObservation[] = [];
  const tool = defineTool({
    id: 't',
    name: 't',
    description: 'A tool.',
    input,
    execute: (given: unknown) => {
      received.push(given);
      return 'ok';
    },
  });
  const agent = defineAgent({ id: 'a', instructions: 'Use the tool.', tools: [tool] });
  const llm = stubSignal([
    { toolCalls: [{ id: 'c1', name: 't', args }] },
    { toolCalls: [{ id: 'c2', name: 'respond', args: { response: 'done' } }] },
  ]);
  const result = await agent.run('go', {
    llm,
    onEvent: (event) => {
      if (event.type === 'tool-end') observations.push(event.observation);
    },
  }).result;
  const described = llm.requests[0]?.tools?.find((descriptor) => descriptor.name === 't')?.parameters;
  return { result, received, observation: observations[0], described, asked: llm.requests.length };
};

const propertiesOf = (described: unknown): unknown =>
  typeof described === 'object' && described !== null && 'properties' in described ? described.properties : undefined;

describe('a tool input schema that converts', () => {
  it.each([
    ['a transform', z.object({ when: z.string().transform((text) => text.length) }), { when: '2026-10-24' }],
    ['a date', z.object({ when: z.date() }), { when: '2026-10-24' }],
  ])('%s has no JSON Schema: the run fails before the model is asked', async (_label, input, args) => {
    const { result, asked, received } = await callOnce(input, args);

    expect(asked).toBe(0);
    expect(received).toEqual([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown');
      expect(result.error.message).toContain('cannot be represented in JSON Schema');
    }
  });

  it('a schema whose output is another kind than its input is described by its output, and never runs', async () => {
    const Flag = z.object({ confirmed: z.stringbool() });

    // What the schema takes: the first parse turns it into a boolean, and the
    // second parse refuses the boolean.
    const asString = await callOnce(Flag, { confirmed: 'true' });
    expect(propertiesOf(asString.described)).toEqual({ confirmed: { type: 'boolean' } });
    expect(asString.received).toEqual([]);
    expect(asString.observation?.kind).toBe('error');

    // What the model is told to send: refused by the first parse.
    const asBoolean = await callOnce(Flag, { confirmed: true });
    expect(asBoolean.received).toEqual([]);
    expect(asBoolean.observation?.kind).toBe('error');
  });

  it('a schema that changes a value is applied twice', async () => {
    const Tag = z.object({ label: z.string().overwrite((text) => `#${text}`) });
    expect(Tag.parse({ label: 'jazz' })).toEqual({ label: '#jazz' });

    const { received, observation } = await callOnce(Tag, { label: 'jazz' });
    expect(received).toEqual([{ label: '##jazz' }]);
    // The observation records the arguments as parsed once.
    expect(observation?.kind === 'result' ? observation.args : undefined).toEqual({ label: '#jazz' });
  });

  it('which is harmless where applying it again changes nothing', async () => {
    const { received } = await callOnce(z.object({ label: z.string().trim() }), { label: '  jazz  ' });
    expect(received).toEqual([{ label: 'jazz' }]);
  });
});
