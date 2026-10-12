import type { ActionDefinition } from '@action';
import { isRecord, walkNodes } from './walk';

export type EndpointUse = {
  name: string;
  kind: 'fn' | 'http';
  url?: string;
  request?: unknown;
  onOpen: boolean;
  later: boolean;
};

export type ActionLiveness = {
  gestures: boolean;
  listens: readonly string[];
  endpoints: readonly EndpointUse[];
  // The layout is a store id and is not read here: `gestures` false then does
  // not mean nothing can be pressed.
  opaqueLayout: boolean;
};

const callsIn = (steps: unknown): Set<string> => {
  const names = new Set<string>();
  walkNodes(steps, (record) => {
    if (typeof record['call'] === 'string') names.add(record['call']);
  });
  return names;
};

export const livenessOf = (definition: ActionDefinition): ActionLiveness => {
  const triggers = definition.triggers ?? [];
  const layout = definition.layout;

  let bound = false;
  if (layout !== undefined && typeof layout !== 'string') {
    walkNodes(layout, (record) => {
      if (typeof record['component'] === 'string' && record['model'] !== undefined) bound = true;
    });
  }

  const opening = callsIn(definition.lifecycle ?? {});
  const afterwards = callsIn(triggers.map((trigger) => trigger.do));

  const endpoints = Object.entries(definition.endpoints ?? {}).map(([name, config]): EndpointUse => {
    const spec: unknown = config;
    const use = { name, onOpen: opening.has(name), later: afterwards.has(name) };
    if (isRecord(spec) && typeof spec['fn'] === 'string') return { ...use, kind: 'fn' };
    return {
      ...use,
      kind: 'http',
      ...(isRecord(spec) && typeof spec['url'] === 'string' ? { url: spec['url'] } : {}),
      ...(isRecord(spec) && spec['request'] !== undefined ? { request: spec['request'] } : {}),
    };
  });

  return {
    gestures: bound || triggers.some((trigger) => typeof trigger.event === 'string'),
    listens: [...new Set(triggers.map((trigger) => trigger.message).filter((channel): channel is string => typeof channel === 'string'))].sort(),
    endpoints,
    opaqueLayout: typeof layout === 'string',
  };
};
