import type { ActionDefinition } from '@action';
import { isRecord, walkNodes } from './walk';

// ═══════════════════════════════════════════════════════════
// What an action can still DO once it has been drawn — read off its own
// definition.
//
// A screen that has been rendered is either finished or it is not. It is
// finished when nothing on it can be pressed, nothing it waits on can arrive,
// and nothing it would call is left to call: its tree is then the whole of it,
// and a host can serve that tree and keep nothing running behind it. Everything
// that makes it NOT finished is a declared part of the definition — a trigger,
// a binding, a channel, an endpoint — so the question is decidable without
// running anything.
//
// This reports the facts and decides nothing. Whether a given endpoint needs a
// server is not nova's to know (it does not know what answers a url); a host
// that does — moss, holding the entries behind each fingerprint — composes the
// verdict from these.
// ═══════════════════════════════════════════════════════════

export type EndpointUse = {
  name: string;
  kind: 'fn' | 'http';
  // http only: the url as authored (a template stays a template), and the
  // request body as authored — where a host finds the fingerprint it replays.
  url?: string;
  request?: unknown;
  // called while the action OPENS (its lifecycle hooks, and what those chain to)
  onOpen: boolean;
  // called because of something that happens LATER (a trigger, and what it chains to)
  later: boolean;
};

export type ActionLiveness = {
  // A person can do something here: a `ui:` trigger, or a two-way binding (a
  // bound field writes the action's data, which lives wherever the shell does).
  gestures: boolean;
  // The channels it waits on — something else can change it while it is shown.
  listens: readonly string[];
  // Every declared endpoint, and when it is called. One that is never called
  // is still listed (`onOpen` and `later` both false): dead, but declared.
  endpoints: readonly EndpointUse[];
  // The layout is a store id, not inline: what it draws — bindings included —
  // cannot be read here, so a caller must not conclude nothing can be pressed.
  opaqueLayout: boolean;
};

// Every endpoint name a list of steps calls, nested steps included.
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
