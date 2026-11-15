import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { HEAD_NAME, createLayoutStore, fillSlots, render } from '@layout';
import type { LayoutNode, RenderNode } from '@layout';
import { harvestLayout, missingFrom } from '../../src/i18n';
import { UnknownActionError, UnknownFragmentError } from '@shared/errors';
import { createShell, headOf, shellIdle } from '@shell';
import { createPermissiveRegistry } from '../helpers';

const page: ActionDefinition = {
  id: 'page',
  data: { said: 'nothing' },
  endpoints: {
    named: { fn: 'valueOf', target: 'said' },
  },
  triggers: [
    { event: 'ui:click', ref: 'fn', do: [{ call: 'named', onError: [{ set: 'said', value: '{{@error.message}}' }] }] },
    { event: 'ui:click', ref: 'endpoint', do: [{ call: 'toString', onError: [{ set: 'said', value: '{{@error.message}}' }] }] },
  ],
};

const shellOf = () =>
  createShell({
    canvases: [{ id: 'main' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { page },
    functions: {},
  });

const saidAfterClick = async (ref: string): Promise<unknown> => {
  const shell = shellOf();
  const id = shell.push('main', 'page');
  await shellIdle(shell);
  shell.dispatch({ type: 'ui:click', ref });
  await shellIdle(shell);
  return shell.getRuntime(id)?.getData()['said'];
};

describe('a name that every object inherits is not an action, fragment, endpoint or function', () => {
  it('push refuses an action named after an inherited property', () => {
    const shell = shellOf();
    for (const name of ['constructor', 'toString', '__proto__']) {
      expect(() => shell.push('main', name)).toThrow(UnknownActionError);
    }
    expect(shell.getCanvasState('main').stack).toHaveLength(0);
  });

  it('push refuses a fragment named after an inherited property', () => {
    const shell = shellOf();
    expect(() => shell.push('main', 'page', undefined, ['valueOf'])).toThrow(UnknownFragmentError);
  });

  it('a function endpoint naming an inherited property reports an unknown function', async () => {
    expect(await saidAfterClick('fn')).toBe('unknown function: valueOf');
  });

  it('a call naming an inherited property reports an unknown endpoint', async () => {
    expect(await saidAfterClick('endpoint')).toBe('unknown endpoint: toString');
  });
});

describe('a phrase or slot named after an inherited property is not in the book', () => {
  const store = createLayoutStore();
  const registry = createPermissiveRegistry();
  const book = { Hello: 'Hallo' };

  it('a text that reads like an inherited name renders as itself', () => {
    const out = render({ layout: { component: 'Text', children: 'constructor' }, store, registry, phrases: book });
    expect(out).toEqual([{ type: 'component', name: 'Text', props: {}, children: [{ type: 'text', value: 'constructor' }] }]);
  });

  it('a counted phrase with a hole named after an inherited property keeps the hole', () => {
    const layout: LayoutNode = { component: 'Text', props: { label: '$.count' } };
    const data = { count: { phrase: 'Hello {toString}', slots: {} } };
    const out = render({ layout, data, store, registry, phrases: book, phraseKeys: { props: ['label'] } });
    expect(out[0]?.type === 'component' ? out[0].props['label'] : undefined).toBe('Hello {toString}');
  });

  it('missingFrom lists a harvested phrase that only an inherited property answers', () => {
    const harvested = harvestLayout({ component: 'Text', props: { label: 'valueOf' } }, { props: ['label'] });
    expect(missingFrom(harvested, book).map((entry) => entry.phrase)).toEqual(['valueOf']);
  });

  it('a fragment slot named after an inherited property is left unfilled', () => {
    expect(fillSlots({ slot: 'toString' }, {})).toEqual({ slot: 'toString' });
  });
});

describe('an object key named after an inherited property is not a directive', () => {
  it('the object is walked and its values resolved', () => {
    const layout: LayoutNode = { component: 'Text', props: { opts: { toString: 'a', constructor: 'c', b: '$.x' } } };
    const out = render({ layout, data: { x: 1 }, store: createLayoutStore(), registry: createPermissiveRegistry() });
    expect(out[0]?.type === 'component' ? out[0].props['opts'] : undefined).toEqual({ toString: 'a', constructor: 'c', b: 1 });
  });
});

describe('a head child named after an inherited property is not something a head holds', () => {
  it('is refused by name', () => {
    const child: RenderNode = { type: 'component', name: 'constructor', props: {}, children: [] };
    const frame = (): RenderNode[] => [{ type: 'component', name: HEAD_NAME, props: {}, children: [child] }];
    expect(headOf({ frame, canvasTree: () => [] })?.refused).toEqual([`${HEAD_NAME}: "constructor" is not something a head holds`]);
  });
});
