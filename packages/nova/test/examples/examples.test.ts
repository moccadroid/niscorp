import { describe, expect, it } from 'vitest';
import { ActionDefinitionSchema } from '../../src';
import { NOVA_EXAMPLES, NOVA_EXAMPLE_GROUPS } from '../../src/examples';
import type { NovaExample } from '../../src/examples';
import { runExample } from './run';

// The examples are what a documentation site shows and what an agent reads, so
// each one is run here as it says and held to what it says must come out. A
// change to what nova does changes its examples in the same commit
// (STYLE_GUIDE.md, "Examples").

// the names an example may ask a kit for: the plain ones every kit has, and nova's own two slots
const PLAIN = ['Stack', 'Text', 'Button', 'Input', 'CanvasSlot', 'ActionSlot'];
const componentsOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(componentsOf);
  if (typeof node !== 'object' || node === null) return [];
  return [...('component' in node && typeof node.component === 'string' ? [node.component] : []), ...Object.values(node).flatMap(componentsOf)];
};
const actionsOf = (example: NovaExample) => (example.action === undefined ? Object.values(example.shell?.actions ?? {}) : [example.action]);

describe('the examples', () => {
  it('each has an id of its own, in kebab-case', () => {
    const ids = NOVA_EXAMPLES.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it('each says what it is', () => {
    for (const example of NOVA_EXAMPLES) {
      expect(example.title.length, example.id).toBeGreaterThan(0);
      expect(example.description.length, example.id).toBeGreaterThan(20);
    }
  });

  it('each is in a group that is named, and every group has some', () => {
    const groups = NOVA_EXAMPLE_GROUPS.map((group) => group.id);
    expect(new Set(groups).size).toBe(groups.length);
    for (const example of NOVA_EXAMPLES) expect(groups, example.id).toContain(example.group);
    for (const group of groups) expect(NOVA_EXAMPLES.some((example) => example.group === group), group).toBe(true);
  });

  it('each is one action or a small shell, never both', () => {
    for (const example of NOVA_EXAMPLES) expect((example.action === undefined) !== (example.shell === undefined), example.id).toBe(true);
  });

  // A host holds all the examples in one shell, so nothing an example names may
  // be named by another: its ids begin with its own.
  it('every id an example brings is its own', () => {
    for (const example of NOVA_EXAMPLES) {
      const own = (id: string): boolean => id === example.id || id.startsWith(`${example.id}.`);
      if (example.action !== undefined) expect(example.action.id, example.id).toBe(example.id);
      for (const [key, action] of Object.entries(example.shell?.actions ?? {})) {
        expect(action.id, example.id).toBe(key);
        expect(own(key), `${example.id}: action ${key}`).toBe(true);
      }
      for (const canvas of example.shell?.canvases ?? []) expect(own(canvas.id), `${example.id}: canvas ${canvas.id}`).toBe(true);
      for (const [key, fragment] of Object.entries(example.fragments ?? {})) {
        expect(fragment.id, example.id).toBe(key);
        expect(own(key), `${example.id}: fragment ${key}`).toBe(true);
      }
      for (const key of [...Object.keys(example.layouts ?? {}), ...Object.keys(example.replies ?? {})]) expect(own(key), `${example.id}: ${key}`).toBe(true);
      for (const key of Object.keys(example.fetches ?? {})) expect(key, example.id).toMatch(new RegExp(`^[A-Z]+ /examples/${example.id}/`));
    }
  });

  it('each names only the plain components and nova’s own slots', () => {
    for (const example of NOVA_EXAMPLES) {
      const drawn = [...actionsOf(example).map((action) => action.layout), example.shell?.canvasLayout, ...(example.shell?.canvases ?? []).map((canvas) => canvas.actionLayout), ...Object.values(example.fragments ?? {}).map((fragment) => fragment.layout), ...Object.values(example.layouts ?? {})];
      for (const name of componentsOf(drawn)) expect(PLAIN, `${example.id}: ${name}`).toContain(name);
    }
  });

  it.each(NOVA_EXAMPLES.map((example) => [example.id, example] as const))('%s is made of valid actions, and run as it says it comes to what it says', async (_id, example) => {
    for (const action of actionsOf(example)) expect(ActionDefinitionSchema.safeParse(action).success, action.id).toBe(true);
    expect(await runExample(example)).toEqual(example.expected);
  });
});
