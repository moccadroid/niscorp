import { describe, expect, it } from 'vitest';
import {
  ActionDefinitionSchema,
  EndpointConfigSchema,
  MutationSchema,
  TriggerConfigSchema,
} from '@action/schemas';

describe('MutationSchema', () => {
  it('accepts set/value', () => {
    expect(MutationSchema.safeParse({ set: 'a', value: 1 }).success).toBe(true);
  });
  it('accepts set/from', () => {
    expect(MutationSchema.safeParse({ set: 'a', from: 'b' }).success).toBe(true);
  });
  it('accepts increment with by', () => {
    expect(MutationSchema.safeParse({ increment: 'n', by: 5 }).success).toBe(true);
  });
  it('rejects unknown kind', () => {
    expect(MutationSchema.safeParse({ frobnicate: 'x' }).success).toBe(false);
  });
});

describe('TriggerConfigSchema', () => {
  it('accepts an event trigger with ref', () => {
    const result = TriggerConfigSchema.safeParse({
      event: 'ui:click',
      ref: 'btn',
      do: [{ toggle: 'open' }],
    });
    expect(result.success).toBe(true);
  });
  it('accepts a message trigger', () => {
    expect(
      TriggerConfigSchema.safeParse({ message: 'updated', do: [{ increment: 'n' }] }).success,
    ).toBe(true);
  });
  it('rejects trigger with no source', () => {
    expect(TriggerConfigSchema.safeParse({ do: [{ toggle: 'x' }] }).success).toBe(false);
  });
});

describe('EndpointConfigSchema', () => {
  it('accepts a basic endpoint', () => {
    expect(
      EndpointConfigSchema.safeParse({ url: '/x', method: 'GET', target: 'data' }).success,
    ).toBe(true);
  });
  it('rejects unknown method', () => {
    expect(EndpointConfigSchema.safeParse({ url: '/x', method: 'OPTIONS' }).success).toBe(false);
  });
});

describe('ActionDefinitionSchema', () => {
  it('accepts a full definition', () => {
    const result = ActionDefinitionSchema.safeParse({
      id: 'a',
      name: 'Test',
      data: { n: 0 },
      layout: { component: 'Text', props: { value: '$.n' } },
      triggers: [
        {
          event: 'ui:click',
          ref: 'btn',
          do: [{ increment: 'n' }, { call: 'save', onSuccess: [{ toggle: 'done' }] }],
        },
      ],
      endpoints: { save: { url: '/x', method: 'POST' } },
      lifecycle: { mount: [{ set: 'ready', value: true }] },
    });
    expect(result.success).toBe(true);
  });
  it('accepts a string layout id', () => {
    expect(ActionDefinitionSchema.safeParse({ id: 'a', layout: 'greeting' }).success).toBe(true);
  });
  it('rejects unknown top-level fields', () => {
    expect(ActionDefinitionSchema.safeParse({ id: 'a', wat: true }).success).toBe(false);
  });
});
