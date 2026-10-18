import type { ActionDefinition, RenderComponentNode, RenderErrorNode, RenderNode } from '@niscorp/nova';

export type StepRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

// A list of steps with every step an endpoint call runs after it.
export const stepsIn = (list: unknown): StepRecord[] =>
  Array.isArray(list) ? list.filter(isRecord).flatMap((step) => [step, ...stepsIn(step['onSuccess']), ...stepsIn(step['onError'])]) : [];

export const allSteps = (definition: ActionDefinition): StepRecord[] => [
  ...(definition.triggers ?? []).flatMap((trigger) => stepsIn(trigger.do)),
  ...Object.values(definition.lifecycle ?? {}).flatMap((hook) => stepsIn(hook)),
];

export type Navigation = { action: string; canvas?: string };

export const navigationOf = (step: StepRecord): Navigation | undefined => {
  for (const key of ['push', 'replace', 'resetTo']) {
    const effect = step[key];
    if (isRecord(effect) && typeof effect['action'] === 'string') {
      return { action: effect['action'], ...(typeof effect['canvas'] === 'string' ? { canvas: effect['canvas'] } : {}) };
    }
  }
  return undefined;
};

export type HttpEndpoint = { name: string; url: string; request: unknown; target?: string };

export const httpEndpoints = (definition: ActionDefinition): HttpEndpoint[] =>
  Object.entries(definition.endpoints ?? {}).flatMap(([name, endpoint]) =>
    'url' in endpoint ? [{ name, url: endpoint.url, request: endpoint.request, ...(endpoint.target === undefined ? {} : { target: endpoint.target }) }] : [],
  );

// The literal fingerprints a request replays: one string, or the strings of a choice between several.
export const fingerprintsOf = (request: unknown): string[] => {
  if (!isRecord(request) || !('fingerprint' in request)) return [];
  const strings = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : isRecord(value) ? Object.values(value).flatMap(strings) : [];
  return strings(request['fingerprint']);
};

export const replays = (definition: ActionDefinition, vexEndpoint: string): string[] =>
  httpEndpoints(definition)
    .filter((endpoint) => endpoint.url === vexEndpoint)
    .flatMap((endpoint) => fingerprintsOf(endpoint.request));

export const contextKeysOf =(request: unknown): string[] => (isRecord(request) && isRecord(request['context']) ? Object.keys(request['context']) : []);

export const componentsIn = (nodes: readonly RenderNode[]): RenderComponentNode[] =>
  nodes.flatMap((node) => (node.type === 'component' ? [node, ...componentsIn(node.children)] : node.type === 'fragment' ? componentsIn(node.children) : []));

export const renderErrorsIn = (nodes: readonly RenderNode[]): RenderErrorNode[] =>
  nodes.flatMap((node) => (node.type === 'error' ? [node] : node.type === 'component' || node.type === 'fragment' ? renderErrorsIn(node.children) : []));

export const describeValue = (value: unknown): string =>
  value === undefined || value === null || (Array.isArray(value) && value.length === 0)
    ? 'EMPTY'
    : Array.isArray(value)
      ? `${value.length} rows`
      : typeof value === 'object'
        ? 'a record'
        : JSON.stringify(value);

export const isEmpty = (value: unknown): boolean => describeValue(value) === 'EMPTY';
