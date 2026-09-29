import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { chainCycles } from '../../src/reflect';

// The chains test/shell/runaway.test.ts stops at runtime, found in the
// definitions — and the ordinary patterns that must not be reported.

const paths = (definitions: ActionDefinition[]): string[] => chainCycles(definitions).map((cycle) => cycle.path);

describe('chainCycles', () => {
  it('a trigger that re-emits its own channel', () => {
    expect(paths([{ id: 'loop', triggers: [{ message: 'x', do: [{ emit: { channel: 'x' } }] }] }])).toEqual(['x —emit (loop)→ x']);
  });

  it('two actions answering each other, reported once', () => {
    const ping: ActionDefinition = { id: 'ping', triggers: [{ message: 'a', do: [{ emit: { channel: 'b' } }] }] };
    const pong: ActionDefinition = { id: 'pong', triggers: [{ message: 'b', do: [{ emit: { channel: 'a' } }] }] };
    expect(paths([ping, pong])).toEqual(['a —emit (ping)→ b —emit (pong)→ a']);
  });

  it('through a call: the emit in onSuccess is part of the chain', () => {
    const again: ActionDefinition = {
      id: 'again',
      endpoints: { load: { url: '/x', method: 'GET' } },
      triggers: [{ message: 'again', do: [{ call: 'load', onSuccess: [{ emit: { channel: 'again' } }] }] }],
    };
    expect(paths([again])).toEqual(['again —emit (again)→ again']);
  });

  it('a mount that reloads itself', () => {
    expect(paths([{ id: 'self', lifecycle: { mount: [{ reload: true }] } }])).toEqual(['mount self —reload (self)→ mount self']);
  });

  it('a mount whose emit reaches a trigger that pushes the same action again', () => {
    const opener: ActionDefinition = {
      id: 'opener',
      lifecycle: { mount: [{ emit: { channel: 'm' } }] },
      triggers: [{ message: 'm', do: [{ push: { action: 'opener' } }] }],
    };
    expect(paths([opener])).toEqual(['m —push (opener)→ mount opener —emit (opener)→ m']);
  });

  it('writers announce, viewers re-read: no cycle', () => {
    const form: ActionDefinition = {
      id: 'form',
      endpoints: { save: { url: '/save', method: 'POST' } },
      triggers: [{ event: 'ui:click', ref: 'save', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'todos-changed' } }, { pop: true }] }] }],
    };
    const list: ActionDefinition = {
      id: 'list',
      endpoints: { load: { url: '/todos', method: 'GET' } },
      lifecycle: { mount: [{ call: 'load' }] },
      triggers: [{ message: 'todos-changed', do: [{ reload: true }] }],
    };
    expect(paths([form, list])).toEqual([]);
  });

  it('a click that emits its own listener is started by a gesture, not a chain: no cycle', () => {
    const counter: ActionDefinition = {
      id: 'counter',
      triggers: [
        { event: 'ui:click', ref: 'go', do: [{ emit: { channel: 'tick' } }] },
        { message: 'tick', do: [{ increment: 'n' }] },
      ],
    };
    expect(paths([counter])).toEqual([]);
  });

  it('a template channel or target is decided at runtime and has no edge', () => {
    const dynamic: ActionDefinition = {
      id: 'dynamic',
      triggers: [{ message: 'x', do: [{ emit: { channel: '{{$.next}}' } }, { push: { action: '{{@event.payload}}' } }] }],
    };
    expect(paths([dynamic])).toEqual([]);
  });
});
