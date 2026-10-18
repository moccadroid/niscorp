import { flattenSchemaIssues } from '@niscorp/cortex';
import { ActionDefinitionSchema, auditAction, getPath, StepSchema, type ActionDefinition, type RenderComponentNode } from '@niscorp/nova';
import { classifyAudit } from '@niscorp/nova/reflect';
import { mount } from './mount';
import { coverage, runProbes } from './probes';
import { allSteps, contextKeysOf, describeValue, fingerprintsOf, httpEndpoints, isEmpty, isRecord, renderErrorsIn } from './read';
import type { CheckResult, Finding, Probe, Proof, ScreenSetup } from './types';

export type CheckOptions = {
  probes?: readonly Probe[];
  // What this build proved: an endpoint that loads nothing while its proof had rows is reported with both contexts.
  proofs?: ReadonlyMap<string, Proof>;
  // Whether a fingerprint may be replayed. Left out, fingerprints are not judged before the mount.
  replayable?: (fingerprint: string) => boolean;
};

const refused = (findings: Finding[]): CheckResult => ({ ok: false, findings, loaded: {} });

const valueAt = (value: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>((at, key) => (at !== null && typeof at === 'object' ? (at as Record<PropertyKey, unknown>)[key] : undefined), value);

const STEP_FORMS =
  '{ "set": "key", "value": … } · { "call": "<endpoint>", "onSuccess": [ … ], "onError": [ … ] } · { "push": { "action": "<id>", "input": { … } } } · ' +
  '{ "replace": { "action": "<id>", "input": { … } } } · { "pop": true }';

// Steps sit in a union, and a schema issue inside one names whichever alternative came closest — often the wrong one.
// Each step is judged on its own instead, before the definition parses, and one nova does not know is shown with the forms a step takes.
const unknownSteps = (candidate: unknown): Finding[] => {
  const walk = (list: unknown, at: string): Finding[] =>
    Array.isArray(list)
      ? list.flatMap((step, index) => {
          const here = `${at}.${index}`;
          const nested = isRecord(step) ? [...walk(step['onSuccess'], `${here}.onSuccess`), ...walk(step['onError'], `${here}.onError`)] : [];
          const alone = isRecord(step) && 'call' in step ? { ...step, onSuccess: [], onError: [] } : step;
          return StepSchema.safeParse(alone).success
            ? nested
            : [{ code: 'schema' as const, message: `${here} is no step nova knows: ${JSON.stringify(step).slice(0, 200)}. A step is one of ${STEP_FORMS}` }, ...nested];
        })
      : [];
  if (!isRecord(candidate)) return [];
  const triggers = Array.isArray(candidate['triggers']) ? candidate['triggers'] : [];
  const lifecycle = isRecord(candidate['lifecycle']) ? candidate['lifecycle'] : {};
  return [
    ...triggers.flatMap((trigger, index) => (isRecord(trigger) ? walk(trigger['do'], `triggers.${index}.do`) : [])),
    ...Object.entries(lifecycle).flatMap(([hook, list]) => walk(list, `lifecycle.${hook}`)),
  ];
};

const statics = (definition: ActionDefinition, setup: ScreenSetup, options: CheckOptions): Finding[] => {
  const vexEndpoints = httpEndpoints(definition).filter((endpoint) => endpoint.url === setup.vex.endpoint);
  const audit = auditAction(definition, { catalog: setup.catalog.map((entry) => ({ id: entry.id, input: entry.input })) })
    .issues.filter((issue) => classifyAudit(issue).kind === 'address')
    .map((message): Finding => ({ code: 'audit', message }));
  const replayable = options.replayable;
  const fingerprints = vexEndpoints.flatMap((endpoint): Finding[] => {
    const replayed = fingerprintsOf(endpoint.request);
    if (replayed.length === 0) return [{ code: 'unknown-fingerprint', message: `endpoint "${endpoint.name}" posts to ${setup.vex.endpoint} without a fingerprint: its request replays a query you proved, { "fingerprint": …, "context": { … } }` }];
    if (replayable === undefined) return [];
    return replayed
      .filter((fingerprint) => !replayable(fingerprint))
      .map((fingerprint) => ({ code: 'unknown-fingerprint', message: `endpoint "${endpoint.name}" replays "${fingerprint}", which no prove call answered and discover did not list: copy the fingerprint from a prove result` }));
  });
  const noData = (options.proofs?.size ?? 0) > 0 && vexEndpoints.length === 0
    ? [{ code: 'no-data' as const, message: `the screen loads none of the data you proved: add an endpoint that posts to ${setup.vex.endpoint} and replays it, called from lifecycle.mount` }]
    : [];
  return [...audit, ...fingerprints, ...noData];
};

// A set path is a bare data key; "$." belongs to bindings.
const setPaths = (definition: ActionDefinition): Finding[] =>
  allSteps(definition).flatMap((step): Finding[] => {
    const path = step['set'];
    return typeof path === 'string' && path.startsWith('$.')
      ? [{ code: 'set-path', message: `step "set: ${path}" names a data key: write "set": "${path.slice(2)}"` }]
      : [];
  });

const loadReport = (definition: ActionDefinition, data: Record<string, unknown>, setup: ScreenSetup, proofs: ReadonlyMap<string, Proof>): { loaded: Record<string, string>; findings: Finding[] } => {
  const loaded: Record<string, string> = {};
  const findings: Finding[] = [];
  for (const endpoint of httpEndpoints(definition)) {
    if (endpoint.target === undefined || endpoint.target.length === 0) continue;
    const value = getPath(data, endpoint.target);
    loaded[endpoint.name] = `${endpoint.target}: ${describeValue(value)}`;
    if (!isEmpty(value) || endpoint.url !== setup.vex.endpoint) continue;
    const proved = fingerprintsOf(endpoint.request).map((fingerprint) => proofs.get(fingerprint)).find((proof) => proof !== undefined && proof.count > 0);
    if (proved === undefined) continue;
    const takes = Object.entries(proved.context).filter(([, meta]) => meta.kind === 'context').map(([key]) => key);
    findings.push({
      code: 'load-empty',
      message: `endpoint "${endpoint.name}" loaded nothing, but its query answered ${proved.count} rows when proved: the query takes [${takes.join(', ')}], the endpoint sends [${contextKeysOf(endpoint.request).join(', ')}]`,
    });
  }
  return { loaded, findings };
};

// A value nova could not resolve stays an object with "$" keys in the rendered props, and the component draws nothing from it.
const unresolvedIn = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(unresolvedIn).find((found) => found !== undefined);
  if (value === null || typeof value !== 'object') return undefined;
  if (Object.keys(value).some((key) => key.startsWith('$'))) return value;
  return Object.values(value).map(unresolvedIn).find((found) => found !== undefined);
};

const unresolvedBindings = (components: readonly RenderComponentNode[]): Finding[] =>
  components.flatMap((node) =>
    Object.entries(node.props).flatMap(([prop, value]): Finding[] => {
      const found = unresolvedIn(value);
      return found === undefined
        ? []
        : [{ code: 'unresolved-binding', message: `${node.name}.${prop} holds ${JSON.stringify(found).slice(0, 120)}, which does not resolve in a layout: bind "$.key" or "{{ }}" — transform ops work only inside endpoints` }];
    }),
  );

// A list that draws nothing while loaded rows appear in no list: it is bound to the wrong place.
const unshownRows = (components: readonly RenderComponentNode[], definition: ActionDefinition, data: Record<string, unknown>, setup: ScreenSetup): Finding[] => {
  const lists = components.flatMap((node) => {
    const rowsProp = setup.kit.lists[node.name]?.rows;
    return rowsProp === undefined ? [] : [{ name: node.name, rowsProp, rows: JSON.stringify(node.props[rowsProp] ?? []) }];
  });
  const unshown = httpEndpoints(definition).flatMap((endpoint) => {
    const value = endpoint.target === undefined ? undefined : getPath(data, endpoint.target);
    return Array.isArray(value) && value.length > 0 && !lists.some((list) => list.rows === JSON.stringify(value)) ? [{ target: endpoint.target ?? '', rows: value.length }] : [];
  });
  const first = unshown[0];
  if (first === undefined) return [];
  return lists
    .filter((list) => list.rows === '[]')
    .map((list) => ({
      code: 'unshown-rows' as const,
      message: `a ${list.name} shows no rows while ${unshown.map((one) => `"${one.target}" holds ${one.rows}`).join(', ')}, which no list shows: bind its ${list.rowsProp} ("${list.rowsProp}": "$.${first.target}")`,
    }));
};

export const checkScreen = async (candidate: unknown, setup: ScreenSetup, options: CheckOptions = {}): Promise<CheckResult> => {
  const parsed = ActionDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    const steps = unknownSteps(candidate);
    if (steps.length > 0) return refused(steps);
    return refused(
      flattenSchemaIssues(parsed.error.issues).map((issue) => ({
        code: 'schema',
        message: `${issue.path.map(String).join('.') || '(root)'}: ${issue.message} — it is ${JSON.stringify(valueAt(candidate, issue.path))?.slice(0, 200) ?? 'missing'}`,
      })),
    );
  }
  const definition = parsed.data;
  const misnamed = setPaths(definition);
  if (misnamed.length > 0) return refused(misnamed);
  const before = statics(definition, setup, options);
  if (before.length > 0) return refused(before);

  const mounted = await mount(definition, setup);
  let loaded: Record<string, string>;
  try {
    const data = mounted.runtime.getData();
    const tree = mounted.tree();
    const components = mounted.components();
    const report = loadReport(definition, data, setup, options.proofs ?? new Map());
    loaded = report.loaded;
    const found: Finding[] = [
      ...mounted.findings,
      ...renderErrorsIn(tree).map((node): Finding => ({ code: 'mount', message: `a layout node did not render: ${node.code}: ${node.message}` })),
      ...report.findings,
      ...unresolvedBindings(components),
      ...unshownRows(components, definition, data, setup),
    ];
    if (found.length > 0) return { ok: false, findings: found, loaded };
  } finally {
    mounted.dispose();
  }

  const probes = options.probes ?? [];
  const uncovered = coverage(definition, probes);
  if (uncovered.length > 0) return { ok: false, findings: uncovered, loaded };
  const probed = await runProbes(definition, probes, setup);
  return { ok: probed.length === 0, findings: probed, loaded };
};
