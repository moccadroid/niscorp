import type { ActionDefinition } from '@action';
import { mutationPaths, rootOf } from '@action/grammar';

// What an action does with its DATA KEYS, read off its own definition.
//
// Four questions, each a pure function of the artifact and each with more than
// one consumer: an audit asking whether declared state is reachable, an agent
// asking whether a change was a person or a re-read, a devtools pane asking what
// fills a field. Every one of them was being re-derived outside nova, which is
// how a hand-copied list of mutation ops ended up in an application.

// What a FINGER can write: every data path a `ui:` trigger sets.
export const gesturedKeys = (definition: ActionDefinition): readonly string[] => [
  ...new Set(
    (definition.triggers ?? [])
      .filter((trigger) => typeof trigger.event === 'string' && trigger.event.startsWith('ui:'))
      .flatMap((trigger) => mutationPaths(trigger.do))
      .map(rootOf),
  ),
];

// What an OPENER may set: the declared input contract.
export const declaredKeys = (definition: ActionDefinition): readonly string[] =>
  Object.keys((definition.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});

// What the DATABASE writes: every endpoint's landing place.
export const loadedKeys = (definition: ActionDefinition): readonly string[] => {
  const loaded = new Set<string>();
  for (const endpoint of Object.values(definition.endpoints ?? {})) {
    const spec = endpoint as { target?: string; errorTarget?: string };
    if (spec.target !== undefined) loaded.add(rootOf(spec.target));
    if (spec.errorTarget !== undefined) loaded.add(rootOf(spec.errorTarget));
  }
  return [...loaded];
};

// What a surface writes to ITSELF when it opens or resumes: a loading flag
// clearing, a working flag resetting.
export const lifecycleKeys = (definition: ActionDefinition): readonly string[] => [
  ...new Set(
    Object.values((definition.lifecycle ?? {}) as Record<string, unknown>)
      .flatMap(mutationPaths)
      .map(rootOf),
  ),
];

// Endpoint names a `mount` step calls, at any depth.
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

// Every `$.<key>` an endpoint's request reads. `{ id: { $ref: '$.issueId' } }`
// and the bare form `'$.issueId'` both count.
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

// Input keys the surface consumes WHEN IT OPENS: an id its own mount-time load
// sends. Writing one into a live instance leaves the previous record's data on
// screen, so a caller that wants to re-aim must re-mount instead.
//
// Cached per definition object: definitions are read on every telemetry event,
// and a bundle sync replaces them wholesale, so identity is the right key.
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
