import { z } from 'zod';
import { getPath, type ActionDefinition } from '@niscorp/nova';
import { mount, type Mounted } from './mount';
import { navigationOf, stepsIn } from './read';
import type { Finding, Probe, ProbeStep, ScreenSetup } from './types';

// Not nullish anywhere: a schema that allows null is answered with null by models on Groq.
export const ProbeSchema = z.object({
  do: z
    .array(
      z.object({
        set: z.string().optional().describe('The ref of an input or select: type into it or pick in it.'),
        to: z.union([z.string(), z.number(), z.boolean()]).optional().describe('With set: what is typed or picked. With click: the option clicked, such as which tab.'),
        click: z.string().optional().describe('The ref of what is clicked. A row ref clicks the first row.'),
      }),
    )
    .min(1)
    .describe('What the person does, in order.'),
  changes: z.string().optional().describe('A data key whose content must be different afterwards.'),
  opens: z.string().optional().describe('An action id that must open afterwards.'),
  reloads: z.string().optional().describe('For a probe that only clicks, such as a refresh: a data key whose endpoint must be called again.'),
});

const said = (step: ProbeStep): string =>
  step.set !== undefined ? `set "${step.set}" to ${JSON.stringify(step.to)}` : `click "${step.click ?? ''}"${step.to === undefined ? '' : ` on ${JSON.stringify(step.to)}`}`;

const malformed = (probe: Probe): string | undefined => {
  const step = probe.do.find((one) => (one.set === undefined) === (one.click === undefined) || (one.set !== undefined && one.to === undefined));
  if (step !== undefined) return `a probe step does one thing: { "set": ref, "to": value } or { "click": ref } — got ${JSON.stringify(step)}`;
  if (probe.changes === undefined && probe.opens === undefined && probe.reloads === undefined) {
    return `the probe "${probe.do.map(said).join(', ')}" says nothing must follow: add "changes" (a data key), "opens" (an action id) or, for a refresh, "reloads" (a data key)`;
  }
  if (probe.reloads !== undefined && probe.changes === undefined && probe.do.some((step) => step.set !== undefined)) {
    return `the probe "${probe.do.map(said).join(', ')}" sets a value, so it says which data key "changes": "reloads" is for a click alone`;
  }
  return undefined;
};

// Every control or row whose trigger loads data or opens a screen, and that a probe can reach, is used by a probe.
export const coverage = (definition: ActionDefinition, probes: readonly Probe[], reachable: ReadonlySet<string>): Finding[] =>
  (definition.triggers ?? []).flatMap((trigger): Finding[] => {
    const ref = trigger.ref;
    if (ref === undefined || !reachable.has(ref) || (trigger.event !== 'ui:model' && trigger.event !== 'ui:click')) return [];
    const steps = stepsIn(trigger.do);
    const calls = steps.flatMap((step) => (typeof step['call'] === 'string' ? [step['call']] : []));
    const opens = steps.flatMap((step) => navigationOf(step)?.action ?? []);
    if (calls.length === 0 && opens.length === 0) return [];
    const typing = trigger.event === 'ui:model';
    if (probes.some((probe) => probe.do.some((step) => (typing ? step.set : step.click) === ref))) return [];
    const does = [...(calls.length > 0 ? [`calls ${calls.map((name) => `"${name}"`).join(', ')}`] : []), ...(opens.length > 0 ? [`opens ${opens.map((id) => `"${id}"`).join(', ')}`] : [])].join(' and ');
    const follows = opens.length > 0 ? 'what opens' : typing ? 'what changes' : 'what changes, or for a refresh what it reloads';
    return [{ code: 'probe-missing', message: `no probe ${typing ? 'sets' : 'clicks'} "${ref}", which ${does}: add one, saying ${follows}` }];
  });

const PROBE_WAIT_MS = 30_000;

const contextOf = (body: unknown): string => JSON.stringify(body !== null && typeof body === 'object' && 'context' in body ? (body as { context: unknown }).context : body);

// Why a data key held the same after the steps, read from what the screen posted.
const sameBecause = (mounted: Mounted, sentBefore: number): string => {
  const after = mounted.sent.slice(sentBefore);
  const last = after[after.length - 1];
  if (last === undefined) return 'Nothing was requested after the steps: the trigger does not call the endpoint that fills it.';
  const first = mounted.sent[sentBefore - 1];
  if (first === undefined) return `The endpoint sent ${contextOf(last)} and the answer did not change: pick a value that changes the rows.`;
  if (contextOf(first) === contextOf(last)) {
    return `The endpoint sent the same context before and after (${contextOf(last)}): the value does not reach the request — bind it in the endpoint's request context.`;
  }
  return `The endpoint sent ${contextOf(first)} and then ${contextOf(last)}, and the answer did not change: pick a value that changes the rows.`;
};

const act = (mounted: Mounted, step: ProbeStep, setup: ScreenSetup): string | undefined => {
  const components = mounted.components();
  if (step.set !== undefined) {
    const node = components.find((one) => one.ref === step.set);
    if (node === undefined) return `nothing on the screen carries the ref "${step.set}"`;
    if (setup.kit.inputs !== undefined && !setup.kit.inputs.includes(node.name)) return `a ${node.name} takes nothing typed or picked; a person clicks it: { "click": "${step.set}", "to": … }`;
    mounted.shell.dispatch({ type: 'ui:model', ref: step.set, payload: step.to });
    return undefined;
  }
  const ref = step.click ?? '';
  const own = components.find((node) => node.ref === ref);
  if (own !== undefined) {
    const payload = step.to ?? setup.kit.clicks?.[own.name]?.(own.props);
    mounted.shell.dispatch({ type: 'ui:click', ref, ...(payload === undefined ? {} : { payload }) });
    return undefined;
  }
  const list = components.find((node) => {
    const rowRef = setup.kit.lists[node.name]?.rowRef;
    return rowRef !== undefined && node.props[rowRef] === ref;
  });
  const capability = list === undefined ? undefined : setup.kit.lists[list.name];
  if (list === undefined || capability === undefined) return `nothing on the screen fires "${ref}"`;
  const rows = list.props[capability.rows];
  if (!Array.isArray(rows) || rows.length === 0) return `the ${list.name} that fires "${ref}" has no rows to click`;
  const row = rows[0] as Record<string, unknown>;
  mounted.shell.dispatch({ type: 'ui:click', ref, payload: capability.rowPayload === undefined ? row : capability.rowPayload(row, list.props) });
  return undefined;
};

const runProbe = async (definition: ActionDefinition, probe: Probe, setup: ScreenSetup): Promise<Finding[]> => {
  const steps = probe.do.map(said).join(', then ');
  const mounted = await mount(definition, setup);
  try {
    const failedAtMount = mounted.findings.length;
    const before = probe.changes === undefined ? undefined : JSON.stringify(getPath(mounted.runtime.getData(), probe.changes));
    const sentBefore = mounted.sent.length;
    const present = new Set(Object.values(mounted.shell.getState().canvases).flatMap((canvas) => canvas.stack.map((instance) => instance.id)));
    const called: string[] = [];
    const offEndpoint = mounted.shell.onEndpoint((event) => {
      if (event.ok) called.push(event.name);
    });

    for (const step of probe.do) {
      const missed = act(mounted, step, setup);
      if (missed !== undefined) return [{ code: 'probe', message: `${steps}: ${missed}` }];
      if (!(await mounted.idle(PROBE_WAIT_MS))) return [{ code: 'probe', message: `${steps}: the screen did not settle within ${PROBE_WAIT_MS / 1000} s` }];
    }
    offEndpoint();

    const found: Finding[] = mounted.findings.slice(failedAtMount).map((finding) => ({ code: 'probe', message: `${steps}: ${finding.message}` }));
    if (probe.changes !== undefined) {
      const now = getPath(mounted.runtime.getData(), probe.changes);
      if (now === undefined) found.push({ code: 'probe', message: `${steps}: there is no data key "${probe.changes}"` });
      else if (JSON.stringify(now) === before) found.push({ code: 'probe', message: `${steps}: "${probe.changes}" holds the same as before. ${sameBecause(mounted, sentBefore)}` });
    }
    if (probe.reloads !== undefined) {
      const filling = Object.entries(definition.endpoints ?? {}).filter(([, endpoint]) => endpoint.target === probe.reloads).map(([name]) => name);
      if (filling.length === 0) found.push({ code: 'probe', message: `${steps}: no endpoint fills "${probe.reloads}"` });
      else if (!filling.some((name) => called.includes(name))) found.push({ code: 'probe', message: `${steps}: "${probe.reloads}" was not loaded again: ${filling.map((name) => `"${name}"`).join(', ')} never ran` });
    }
    if (probe.opens !== undefined) {
      const opened = Object.values(mounted.shell.getState().canvases).flatMap((canvas) => canvas.stack.filter((instance) => !present.has(instance.id)));
      const target = opened.find((instance) => instance.definitionId === probe.opens);
      if (target === undefined) {
        const instead = opened.map((instance) => `"${instance.definitionId}"`).join(', ');
        found.push({ code: 'probe', message: `${steps}: "${probe.opens}" did not open${instead.length > 0 ? ` (${instead} did)` : ''}` });
      } else {
        const entry = setup.catalog.find((candidate) => candidate.id === probe.opens);
        const required = Array.isArray(entry?.input['required']) ? (entry.input['required'] as unknown[]).filter((key): key is string => typeof key === 'string') : [];
        for (const key of required) {
          const value = target.data[key];
          if (value === undefined || value === null || value === '') found.push({ code: 'probe', message: `${steps}: "${probe.opens}" opened without its "${key}" (got ${JSON.stringify(value)})` });
        }
      }
    }
    return found;
  } finally {
    mounted.dispose();
  }
};

// Each probe on a fresh mount, so no probe starts from what another left behind.
export const runProbes = async (definition: ActionDefinition, probes: readonly Probe[], setup: ScreenSetup, reachable: ReadonlySet<string>): Promise<Finding[]> => {
  const out = probes.flatMap((probe) => probe.do.flatMap((step) => [step.set, step.click]).filter((ref): ref is string => ref !== undefined && !reachable.has(ref)));
  if (out.length > 0) {
    return [{ code: 'probe', message: `a probe can use only what carries a ref on the screen and the rows of a list; ${[...new Set(out)].map((ref) => `"${ref}"`).join(', ')} ${out.length === 1 ? 'is' : 'are'} fired from inside a component, so leave ${out.length === 1 ? 'it' : 'them'} out of the probes` }];
  }
  const wrong = probes.flatMap((probe) => malformed(probe) ?? []);
  if (wrong.length > 0) return wrong.map((message) => ({ code: 'probe', message }));
  const found: Finding[] = [];
  for (const probe of probes) found.push(...(await runProbe(definition, probe, setup)));
  return found;
};
