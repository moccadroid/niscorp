import { describe, expect, it } from 'vitest';
import { composeAction } from '@action';
import type { ActionDefinition, ActionFragment } from '@action';

const modal: ActionFragment = {
  kind: 'fragment',
  id: 'modal',
  layout: { component: 'Overlay', children: { component: 'Dialog', children: { slot: 'body' } } },
  data: { modal: { open: true }, title: 'frag' },
  triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
  lifecycle: { mount: [{ set: 'a', value: 1 }] },
};

const newContact: ActionDefinition = {
  id: 'new-contact',
  layout: { component: 'Form' },
  data: { title: 'New contact', draft: {} },
  triggers: [{ event: 'ui:click', ref: 'confirm', do: [{ pop: true }] }],
  lifecycle: { mount: [{ set: 'b', value: 2 }] },
};

describe('composeAction', () => {
  it('wraps the action layout into the fragment slot', () => {
    const out = composeAction(newContact, [modal]);
    expect(out.layout).toEqual({
      component: 'Overlay',
      children: { component: 'Dialog', children: { component: 'Form' } },
    });
  });

  it('merges data with the action winning', () => {
    const out = composeAction(newContact, [modal]);
    expect(out.data).toEqual({ modal: { open: true }, title: 'New contact', draft: {} });
  });

  it('concatenates triggers, fragment first', () => {
    const out = composeAction(newContact, [modal]);
    expect(out.triggers?.map((t) => t.ref)).toEqual(['close', 'confirm']);
  });

  it('concatenates lifecycle hooks, fragment steps before the action\'s', () => {
    const out = composeAction(newContact, [modal]);
    expect(out.lifecycle?.mount).toEqual([{ set: 'a', value: 1 }, { set: 'b', value: 2 }]);
  });

  it('merges endpoints with the action winning on a name clash', () => {
    const frag: ActionFragment = { kind: 'fragment', id: 'f', endpoints: { load: { fn: 'fragLoad' }, fOnly: { fn: 'x' } } };
    const act: ActionDefinition = { id: 'a', endpoints: { load: { fn: 'actLoad' } } };
    expect(composeAction(act, [frag]).endpoints).toEqual({ load: { fn: 'actLoad' }, fOnly: { fn: 'x' } });
  });

  it('keeps the action id and produces a plain ActionDefinition (no kind)', () => {
    const out = composeAction(newContact, [modal]);
    expect(out.id).toBe('new-contact');
    expect('kind' in out).toBe(false);
  });

  it('returns the action untouched when there are no fragments', () => {
    expect(composeAction(newContact, [])).toBe(newContact);
  });
});
