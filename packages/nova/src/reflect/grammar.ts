import type { ActionDefinition } from '@action';
import { mutationPaths, rootOf } from '@action/grammar';

export const gesturedKeys = (definition: ActionDefinition): readonly string[] => [
  ...new Set(
    (definition.triggers ?? [])
      .filter((trigger) => typeof trigger.event === 'string' && trigger.event.startsWith('ui:'))
      .flatMap((trigger) => mutationPaths(trigger.do))
      .map(rootOf),
  ),
];

export const declaredKeys = (definition: ActionDefinition): readonly string[] =>
  Object.keys((definition.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});

export const loadedKeys = (definition: ActionDefinition): readonly string[] => {
  const loaded = new Set<string>();
  for (const endpoint of Object.values(definition.endpoints ?? {})) {
    const spec = endpoint as { target?: string; errorTarget?: string };
    if (spec.target !== undefined) loaded.add(rootOf(spec.target));
    if (spec.errorTarget !== undefined) loaded.add(rootOf(spec.errorTarget));
  }
  return [...loaded];
};

export const lifecycleKeys = (definition: ActionDefinition): readonly string[] => [
  ...new Set(
    Object.values((definition.lifecycle ?? {}) as Record<string, unknown>)
      .flatMap(mutationPaths)
      .map(rootOf),
  ),
];

const mountCalls = (definition: ActionDefinition): Set<string> => {
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const step = node as Record<string, unknown>;
    if (typeof step['call'] === 'string') names.add(step['call']);
    walk(step['onSuccess']);
    walk(step['onError']);
  };
  walk((definition.lifecycle as { mount?: unknown } | undefined)?.mount);
  return names;
};

const requestKeys = (request: unknown): string[] => {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node.startsWith('$.')) found.push(rootOf(node.slice(2)));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const value of Object.values(node as Record<string, unknown>)) walk(value);
  };
  walk(request);
  return found.filter((key) => key !== '');
};

const mountInputCache = new WeakMap<ActionDefinition, ReadonlySet<string>>();

export const mountInputKeys = (definition: ActionDefinition): ReadonlySet<string> => {
  const cached = mountInputCache.get(definition);
  if (cached !== undefined) return cached;
  const called = mountCalls(definition);
  const declared = new Set(declaredKeys(definition));
  const keys = new Set<string>();
  for (const [name, endpoint] of Object.entries(definition.endpoints ?? {})) {
    if (!called.has(name)) continue;
    for (const key of requestKeys((endpoint as { request?: unknown }).request)) if (declared.has(key)) keys.add(key);
  }
  mountInputCache.set(definition, keys);
  return keys;
};
