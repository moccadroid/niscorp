import { flattenSchemaIssues } from '@niscorp/cortex';
import { ActionDefinitionSchema, auditAction, getPath, paletteFromRegistry, StepSchema, type ActionDefinition, type RenderComponentNode } from '@niscorp/nova';
import { collectInteractive } from '@niscorp/nova/agent';
import { classifyAudit } from '@niscorp/nova/reflect';
import { mount } from './mount';
import { coverage, runProbes } from './probes';
import { allSteps, contextKeysOf, describeValue, fingerprintsOf, httpEndpoints, isEmpty, isRecord, renderErrorsIn, RESERVED_CONTEXT } from './read';
import type { CheckResult, Finding, Probe, Proof, ScreenSetup } from './types';

export type CheckOptions = {
  probes?: readonly Probe[];
  // What this build proved: an endpoint that loads nothing while its proof had rows is reported with both contexts.
  proofs?: ReadonlyMap<string, Proof>;
  // Whether a fingerprint may be replayed. Left out, fingerprints are not judged before the mount.
  replayable?: (fingerprint: string) => boolean;
  // The context keys of a query that vex matches like a search.
  patterns?: (fingerprint: string) => readonly string[];
};

const refused = (findings: Finding[]): CheckResult => ({ ok: false, findings, loaded: {} });

const valueAt = (value: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>((at, key) => (at !== null && typeof at === 'object' ? (at as Record<PropertyKey, unknown>)[key] : undefined), value);

// Keys beside "component" that the component takes as props belong inside "props".
const propsBeside = (node: unknown, keys: unknown, setup: ScreenSetup): string => {
  if (!isRecord(node) || typeof node['component'] !== 'string' || !Array.isArray(keys)) return '';
  const schema = paletteFromRegistry(setup.kit.registry, { include: [node['component']] })[0]?.propsSchema;
  const props = isRecord(schema) && isRecord(schema['properties']) ? schema['properties'] : {};
  const misplaced = keys.filter((key): key is string => typeof key === 'string' && Object.hasOwn(props, key));
  return misplaced.length === 0 ? '' : `: ${misplaced.map((key) => `"${key}"`).join(', ')} ${misplaced.length === 1 ? 'is a prop' : 'are props'} of ${node['component']}, so ${misplaced.length === 1 ? 'it goes' : 'they go'} inside "props"`;
};

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
  const audit = auditAction(definition, { catalog: setup.catalog.map((entry) => ({ id: entry.id, input: entry.input })), ...(setup.channels === undefined ? {} : { channels: setup.channels }) })
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
  // An ambient value written down is right for one day or one person.
  const frozen = vexEndpoints.flatMap((endpoint): Finding[] => {
    const context = isRecord(endpoint.request) && isRecord(endpoint.request['context']) ? endpoint.request['context'] : {};
    return Object.entries(context).flatMap(([key, value]): Finding[] => {
      const ambient = Object.entries(setup.ambient).find(([, now]) => typeof value === 'string' && value === now)?.[0];
      return ambient === undefined
        ? []
        : [{ code: 'frozen-value', message: `endpoint "${endpoint.name}" sends "${key}": ${JSON.stringify(value)}, the value $.${ambient} has now; it changes, so send { "$ref": "$.${ambient}" }, and count any value from it in the request ({ "$dateAdd": … } for a date).` }];
    });
  });
  // A pattern sent empty matches nothing.
  const emptyPatterns = vexEndpoints.flatMap((endpoint): Finding[] => {
    const context = isRecord(endpoint.request) && isRecord(endpoint.request['context']) ? endpoint.request['context'] : {};
    const signatures = fingerprintsOf(endpoint.request).map((fingerprint) => options.patterns?.(fingerprint) ?? []);
    return Object.entries(context)
      .filter(([key, value]) => value === '' && signatures.some((patterns) => patterns.includes(key)))
      .map(([key]) => ({ code: 'empty-pattern' as const, message: `endpoint "${endpoint.name}" sends "${key}": "", and "${key}" is matched like a search, so "" matches nothing: send "%" for everything, or wrap what is typed in "%"` }));
  });
  // A key the proved query does not bind changes nothing, whatever the screen sends in it.
  const unbound = vexEndpoints.flatMap((endpoint): Finding[] => {
    const proofs = fingerprintsOf(endpoint.request).map((fingerprint) => options.proofs?.get(fingerprint));
    if (proofs.length === 0 || proofs.some((proof) => proof === undefined)) return [];
    const sent = contextKeysOf(endpoint.request).filter((key) => !RESERVED_CONTEXT.has(key));
    const ignored = sent.filter((key) => proofs.every((proof) => !Object.hasOwn(proof?.context ?? {}, key)));
    return ignored.length === 0
      ? []
      : [{ code: 'ignored-context', message: `endpoint "${endpoint.name}" sends ${ignored.map((key) => `"${key}"`).join(', ')}, which its query does not take, so the value changes nothing: describe a query that names it` }];
  });
  const noData = (options.proofs?.size ?? 0) > 0 && vexEndpoints.length === 0
    ? [{ code: 'no-data' as const, message: `the screen loads none of the data you proved: add an endpoint that posts to ${setup.vex.endpoint} and replays it, called from lifecycle.mount` }]
    : [];
  return [...audit, ...fingerprints, ...frozen, ...emptyPatterns, ...unbound, ...noData];
};

// A set path is a bare data key; "$." belongs to bindings.
const setPaths = (definition: ActionDefinition): Finding[] =>
  allSteps(definition).flatMap((step): Finding[] => {
    const path = step['set'];
    return typeof path === 'string' && path.startsWith('$.')
      ? [{ code: 'set-path', message: `step "set: ${path}" names a data key: write "set": "${path.slice(2)}"` }]
      : [];
  });

const loadReport = (
  definition: ActionDefinition,
  data: Record<string, unknown>,
  setup: ScreenSetup,
  proofs: ReadonlyMap<string, Proof>,
  sent: readonly unknown[],
): { loaded: Record<string, string>; findings: Finding[] } => {
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
    const replayed = new Set(fingerprintsOf(endpoint.request));
    const body = [...sent].reverse().find((one) => isRecord(one) && typeof one['fingerprint'] === 'string' && replayed.has(one['fingerprint']));
    const context = isRecord(body) ? JSON.stringify(body['context'] ?? {}) : undefined;
    findings.push({
      code: 'load-empty',
      message: `endpoint "${endpoint.name}" loaded nothing, but its query answered ${proved.count} rows when proved: the query takes [${takes.join(', ')}], the endpoint ${context === undefined ? `sends [${contextKeysOf(endpoint.request).join(', ')}]` : `sent ${context}`}`,
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

// Loaded data the layout never binds: the screen draws none of it.
const unbound = (definition: ActionDefinition, data: Record<string, unknown>): Finding[] => {
  const bound = new Set(collectInteractive(definition.layout).boundKeys);
  return httpEndpoints(definition).flatMap((endpoint): Finding[] => {
    const target = endpoint.target;
    if (target === undefined || target.length === 0) return [];
    const value = getPath(data, target);
    const root = target.split('.')[0] ?? target;
    return isEmpty(value) || bound.has(root) ? [] : [{ code: 'unshown-rows', message: `"${target}" holds ${describeValue(value)} that nothing on the screen shows: bind it in the layout ("$.${target}")` }];
  });
};

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

// An optional key sent as "" filters on an empty value; null leaves the filter out.
const emptyOptionals = (sent: readonly unknown[], proofs: ReadonlyMap<string, Proof>): Finding[] => {
  const found = new Map<string, Finding>();
  for (const body of sent) {
    if (!isRecord(body) || typeof body['fingerprint'] !== 'string' || !isRecord(body['context'])) continue;
    const proof = proofs.get(body['fingerprint']);
    for (const [key, value] of Object.entries(body['context'])) {
      if (value !== '' || proof?.context[key]?.optional !== true) continue;
      found.set(key, { code: 'empty-optional', message: `a request sent "${key}": "", and "${key}" is optional: "" filters on an empty value, so nothing matches. Send null to leave the filter out: { "$case": { "branches": [ { "when": <the value>, "then": <the value> } ] } } has no else, and gives null.` });
    }
  }
  return [...found.values()];
};

// A ui:model trigger on a component that never sends one never fires.
const deadTriggers = (definition: ActionDefinition, components: readonly RenderComponentNode[], setup: ScreenSetup): Finding[] => {
  const inputs = setup.kit.inputs;
  if (inputs === undefined) return [];
  return (definition.triggers ?? []).flatMap((trigger): Finding[] => {
    if (trigger.event !== 'ui:model') return [];
    const node = components.find((one) => one.ref === trigger.ref);
    return node === undefined || inputs.includes(node.name)
      ? []
      : [{ code: 'dead-trigger', message: `a ${node.name} sends no ui:model, so the trigger on "${node.ref ?? ''}" never fires: a ${node.name} is clicked — trigger on ui:click, where @event.payload is what the click carries` }];
  });
};

// What a probe can click or set: an element that carries a ref, and the rows of a list.
const reachableRefs = (components: readonly RenderComponentNode[], setup: ScreenSetup): ReadonlySet<string> =>
  new Set(
    components.flatMap((node) => {
      const rowRef = setup.kit.lists[node.name]?.rowRef;
      const fired = rowRef === undefined ? undefined : node.props[rowRef];
      return [...(node.ref === undefined ? [] : [node.ref]), ...(typeof fired === 'string' ? [fired] : [])];
    }),
  );

// A list that reads a key no row has draws that column empty.
const emptyColumns = (components: readonly RenderComponentNode[], setup: ScreenSetup): Finding[] =>
  components.flatMap((node): Finding[] => {
    const capability = setup.kit.lists[node.name];
    const rows = capability === undefined ? undefined : node.props[capability.rows];
    if (capability?.reads === undefined || !Array.isArray(rows) || rows.length === 0) return [];
    const records = rows.filter(isRecord);
    const has = (key: string): boolean => records.some((row) => !isEmpty(getPath(row, key)) || getPath(row, key) === 0 || getPath(row, key) === false);
    const missing = capability.reads(node.props).filter((key) => !has(key));
    const keys = Object.keys(records[0] ?? {});
    return missing.length === 0
      ? []
      : [{ code: 'unshown-rows', message: `a ${node.name} reads ${missing.map((key) => `"${key}"`).join(', ')}, which no row has, so it draws empty: the rows have ${keys.map((key) => `"${key}"`).join(', ')}` }];
  });

export const checkScreen = async (candidate: unknown, setup: ScreenSetup, options: CheckOptions = {}): Promise<CheckResult> => {
  const parsed = ActionDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    const steps = unknownSteps(candidate);
    if (steps.length > 0) return refused(steps);
    return refused(
      flattenSchemaIssues(parsed.error.issues).map((issue) => {
        const value = valueAt(candidate, issue.path);
        return {
          code: 'schema',
          message: `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}${propsBeside(value, (issue as { keys?: unknown }).keys, setup)} — it is ${JSON.stringify(value)?.slice(0, 200) ?? 'missing'}`,
        };
      }),
    );
  }
  const definition = parsed.data;
  const misnamed = setPaths(definition);
  if (misnamed.length > 0) return refused(misnamed);
  const before = statics(definition, setup, options);
  if (before.length > 0) return refused(before);

  const mounted = await mount(definition, setup);
  let loaded: Record<string, string>;
  let reachable: ReadonlySet<string>;
  try {
    const data = mounted.runtime.getData();
    const tree = mounted.tree();
    const components = mounted.components();
    reachable = reachableRefs(components, setup);
    const report = loadReport(definition, data, setup, options.proofs ?? new Map(), mounted.sent);
    loaded = report.loaded;
    const found: Finding[] = [
      ...mounted.findings,
      ...renderErrorsIn(tree).map((node): Finding => ({ code: 'mount', message: `a layout node did not render: ${node.code}: ${node.message}` })),
      ...report.findings,
      ...unresolvedBindings(components),
      ...unbound(definition, data),
      ...unshownRows(components, definition, data, setup),
      ...emptyColumns(components, setup),
      ...deadTriggers(definition, components, setup),
      ...emptyOptionals(mounted.sent, options.proofs ?? new Map()),
    ];
    if (found.length > 0) return { ok: false, findings: found, loaded };
  } finally {
    mounted.dispose();
  }

  const probes = options.probes ?? [];
  const uncovered = coverage(definition, probes, reachable);
  if (uncovered.length > 0) return { ok: false, findings: uncovered, loaded };
  const probed = await runProbes(definition, probes, setup, reachable);
  return { ok: probed.length === 0, findings: probed, loaded };
};
