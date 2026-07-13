import { describe, it, expect } from 'vitest';
import { auditAction, collectChannels } from '../../src/action/audit';
import type { ActionDefinition } from '../../src/action/schemas';

// auditAction cross-references a definition's own parts: layout bindings ↔
// data defaults, refs ↔ triggers, call steps ↔ endpoints, targets ↔ data,
// pushes ↔ catalog. Every failure it reports would mount and render politely
// while being broken at click time.

const CATALOG = [
  { id: 'deal', input: { type: 'object', properties: { id: {} } } },
  { id: 'task.form', input: { type: 'object', properties: { title: {} } } },
];

const sound: ActionDefinition = {
  id: 'view.test',
  data: { rows: [], search: '', loading: true },
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: {}, response: {}, target: 'rows' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ call: 'load' }] },
    { event: 'ui:click', ref: 'row', do: [{ push: { action: 'deal', input: { id: '@event.payload' } } }] },
  ],
  layout: {
    component: 'Stack',
    children: [
      { component: 'Input', ref: 'search', model: '$.search' },
      { component: 'Table', ref: 'row', props: { rows: '$.rows', loading: '$.loading' } },
    ],
  },
};

describe('auditAction', () => {
  it('a sound definition passes', () => {
    const result = auditAction(sound, { catalog: CATALOG });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('flags a layout binding with no data default', () => {
    const def: ActionDefinition = {
      ...sound,
      layout: { component: 'Text', children: '{{$.kpi}} open' },
      triggers: [],
    };
    const result = auditAction(def);
    expect(result.issues.some((issue) => issue.includes('"$.kpi"'))).toBe(true);
  });

  it('flags dead chrome (ref without trigger) and phantom triggers (ref without node)', () => {
    const def: ActionDefinition = {
      ...sound,
      triggers: [{ event: 'ui:click', ref: 'ghost', do: [{ call: 'load' }] }],
    };
    const result = auditAction(def);
    expect(result.issues.some((issue) => issue.includes('"search" has no trigger'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('"row" has no trigger'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('"ghost" but no layout node'))).toBe(true);
  });

  it('flags a call to an endpoint that does not exist', () => {
    const def: ActionDefinition = {
      ...sound,
      lifecycle: { mount: [{ call: 'loadTasks' }] },
    };
    const result = auditAction(def);
    expect(result.issues.some((issue) => issue.includes('"loadTasks"'))).toBe(true);
  });

  it('flags an endpoint target with no data default', () => {
    const def: ActionDefinition = {
      ...sound,
      endpoints: { load: { url: '/api/vex', method: 'POST', target: 'tasks' } },
    };
    const result = auditAction(def);
    expect(result.issues.some((issue) => issue.includes('target "tasks"'))).toBe(true);
  });

  it('flags a push to an unknown action and an illegal input key', () => {
    const def: ActionDefinition = {
      ...sound,
      triggers: [
        { event: 'ui:click', ref: 'row', do: [{ push: { action: 'tasks', input: { mode: 'create' } } }] },
        { event: 'ui:click', ref: 'search', do: [{ push: { action: 'deal', input: { deal_id: 'x' } } }] },
      ],
    };
    const result = auditAction(def, { catalog: CATALOG });
    expect(result.issues.some((issue) => issue.includes('"tasks" which is not in the catalog'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('input key "deal_id"'))).toBe(true);
  });

  it('flags a mutation writing an undeclared key; nested steps are walked', () => {
    const def: ActionDefinition = {
      ...sound,
      lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'ready', value: true }] }] },
    };
    const result = auditAction(def);
    expect(result.issues.some((issue) => issue.includes('set: ready'))).toBe(true);
  });

  it('without a catalog, pushes are not judged', () => {
    const def: ActionDefinition = {
      ...sound,
      triggers: [
        { event: 'ui:click', ref: 'row', do: [{ push: { action: 'anything' } }] },
        { event: 'ui:model', ref: 'search', do: [{ call: 'load' }] },
      ],
    };
    const result = auditAction(def);
    expect(result.issues).toEqual([]);
  });

  it('a stored-layout (string) definition skips layout checks', () => {
    const def: ActionDefinition = { ...sound, layout: 'stored-id', triggers: [] };
    const result = auditAction(def);
    expect(result.issues).toEqual([]);
  });

  it('flags a malformed binding ($name without a loop) but accepts loop variables', () => {
    const def: ActionDefinition = {
      ...sound,
      triggers: [],
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: '{{$kpi.count}} open' },
          { for: '$.rows', as: 'row', do: { component: 'Text', children: '{{$row.title}}' } },
        ],
      },
    };
    const result = auditAction(def);
    expect(result.issues.some((issue) => issue.includes('$kpi.') && issue.includes('malformed'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('$row'))).toBe(false);
  });

  it('checks message channels against the provided vocabulary (own emits/listens count)', () => {
    const def: ActionDefinition = {
      ...sound,
      triggers: [
        { event: 'ui:model', ref: 'search', do: [{ call: 'load' }] },
        { event: 'ui:click', ref: 'row', do: [{ emit: { channel: 'tasks:changed' } }] },
        { message: 'tasks-changed', do: [{ call: 'load' }] },
        // A self-pair: emitting AND listening on a private channel is legal.
        { message: 'my-own-refresh', do: [{ call: 'load', onSuccess: [{ emit: { channel: 'my-own-refresh' } }] }] },
      ],
    };
    const result = auditAction(def, { channels: ['tasks-changed'] });
    expect(result.issues.some((issue) => issue.includes('emits channel "tasks:changed"'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('my-own-refresh'))).toBe(false);
    expect(result.issues.some((issue) => issue.includes('"tasks-changed"'))).toBe(false);
  });
});

describe('collectChannels', () => {
  it('collects emits (nested steps included) and listens', () => {
    const def: ActionDefinition = {
      id: 'x',
      triggers: [
        { message: 'deals-changed', do: [{ call: 'load' }] },
        { event: 'ui:click', ref: 'save', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
      ],
      endpoints: { load: { url: '/x', method: 'POST' }, save: { url: '/x', method: 'POST' } },
      data: {},
    };
    expect(collectChannels(def)).toEqual({ emits: ['tasks-changed'], listens: ['deals-changed'] });
  });
});
