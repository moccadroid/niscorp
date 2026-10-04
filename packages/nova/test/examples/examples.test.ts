import { describe, expect, it } from 'vitest';
import { ActionDefinitionSchema } from '../../src';
import { NOVA_EXAMPLES, NOVA_EXAMPLE_GROUPS } from '../../src/examples';
import { runExample } from './run';

// The examples are what a documentation site shows and what an agent reads, so
// each one is run here as it says and held to what it says must come out. A
// change to what nova does changes its examples in the same commit
// (STYLE_GUIDE.md, "Examples").

// the names an example may ask a kit for: the plain ones every kit has
const PLAIN = ['Stack', 'Text', 'Button', 'Input'];
const componentsOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(componentsOf);
  if (typeof node !== 'object' || node === null) return [];
  return [...('component' in node && typeof node.component === 'string' ? [node.component] : []), ...Object.values(node).flatMap(componentsOf)];
};

describe('the examples', () => {
  it('each has an id of its own, in kebab-case, and it is its action’s id', () => {
    const ids = NOVA_EXAMPLES.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const example of NOVA_EXAMPLES) {
      expect(example.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      expect(example.action.id).toBe(example.id);
    }
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

  it('each names only the plain components, and no prop about looks', () => {
    for (const example of NOVA_EXAMPLES) {
      for (const name of componentsOf(example.action.layout)) expect(PLAIN, `${example.id}: ${name}`).toContain(name);
    }
  });

  it.each(NOVA_EXAMPLES.map((example) => [example.id, example] as const))('%s is a valid action, and run as it says it comes to what it says', async (_id, example) => {
    expect(ActionDefinitionSchema.safeParse(example.action).success).toBe(true);
    expect(await runExample(example)).toEqual(example.expected);
  });
});
