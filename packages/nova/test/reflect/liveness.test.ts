import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { livenessOf } from '../../src/reflect';

// What an action can still do once drawn — the facts a host decides
// "does this screen need a shell" from.

describe('livenessOf', () => {
  it('authored data and a layout: nothing left to do', () => {
    const slide: ActionDefinition = { id: 'slide', data: { title: 'Nova' }, layout: { component: 'Headline', children: '$.title' } };
    expect(livenessOf(slide)).toEqual({ gestures: false, listens: [], endpoints: [], opaqueLayout: false });
  });

  it('a ui trigger is something a person can do', () => {
    const counter: ActionDefinition = { id: 'counter', data: { n: 0 }, triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }] };
    expect(livenessOf(counter).gestures).toBe(true);
  });

  it('a bound field is something a person can do, with no trigger at all', () => {
    const form: ActionDefinition = { id: 'form', data: { name: '' }, layout: { component: 'Stack', children: [{ component: 'Input', model: '$.name' }] } };
    expect(livenessOf(form).gestures).toBe(true);
  });

  it('a ref nobody catches is dead chrome, not a gesture', () => {
    const dead: ActionDefinition = { id: 'dead', layout: { component: 'Button', ref: 'go' } };
    expect(livenessOf(dead).gestures).toBe(false);
  });

  it('a message trigger is waiting, not a gesture', () => {
    const viewer: ActionDefinition = { id: 'viewer', triggers: [{ message: 'todos-changed', do: [{ reload: true }] }] };
    const liveness = livenessOf(viewer);
    expect(liveness.gestures).toBe(false);
    expect(liveness.listens).toEqual(['todos-changed']);
  });

  it('an endpoint called on open is told apart from one called later', () => {
    const list: ActionDefinition = {
      id: 'list',
      data: { rows: [] },
      endpoints: {
        load: { url: '/api/todos/vex', method: 'POST', request: { fingerprint: 'todos/open' }, target: 'rows' },
        save: { url: '/api/todos/vex', method: 'POST', request: { fingerprint: 'todos/save' } },
        ask: { fn: 'assistant.ask' },
        unused: { url: '/api/x', method: 'GET' },
      },
      lifecycle: { mount: [{ call: 'load' }] },
      triggers: [{ event: 'ui:click', ref: 'save', do: [{ call: 'save', onSuccess: [{ call: 'load' }, { call: 'ask' }] }] }],
    };
    expect(livenessOf(list).endpoints).toEqual([
      { name: 'load', kind: 'http', url: '/api/todos/vex', request: { fingerprint: 'todos/open' }, onOpen: true, later: true },
      { name: 'save', kind: 'http', url: '/api/todos/vex', request: { fingerprint: 'todos/save' }, onOpen: false, later: true },
      { name: 'ask', kind: 'fn', onOpen: false, later: true },
      { name: 'unused', kind: 'http', url: '/api/x', onOpen: false, later: false },
    ]);
  });

  it('a call chained from a mount is part of opening', () => {
    const detail: ActionDefinition = {
      id: 'detail',
      endpoints: { a: { url: '/a', method: 'GET' }, b: { url: '/b', method: 'GET' } },
      lifecycle: { mount: [{ call: 'a', onSuccess: [{ call: 'b' }] }] },
    };
    expect(livenessOf(detail).endpoints.map((use) => [use.name, use.onOpen, use.later])).toEqual([
      ['a', true, false],
      ['b', true, false],
    ]);
  });

  it('a layout kept in the store cannot be read here, and says so', () => {
    expect(livenessOf({ id: 'stored', layout: 'some.layout' }).opaqueLayout).toBe(true);
  });
});
