import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@niscorp/cortex';
import { ActionDefinitionSchema, type ActionDefinition } from '@niscorp/nova';
import { vexGuide, type ContextSignature, type QueryRequest, type QueryResponse } from '@niscorp/vex';
import { checkScreen } from './check';
import { ProbeSchema } from './probes';
import type { Finding, Probe, Proof, ScreenSetup } from './types';

export type BuildState = {
  proofs: Map<string, Proof>;
  // What discover listed, with the context each query takes.
  listed: Map<string, ContextSignature | undefined>;
  // The fingerprints the definition being edited replays.
  inherited: Set<string>;
  // A new query's intent and shape → the fingerprint vex gave it in this build.
  asked: Map<string, string>;
  // Fingerprint and context of every answer given, to say when a call repeats one.
  answered: Set<string>;
  passed?: { action: ActionDefinition; probes: Probe[] };
  // The last definition the check found fault with, as it was sent.
  last?: { action: unknown; findings: Finding[] };
};

export const newBuildState = (inherited: Iterable<string> = []): BuildState => ({
  proofs: new Map(),
  listed: new Map(),
  inherited: new Set(inherited),
  asked: new Map(),
  answered: new Set(),
});

export const replayable = (state: BuildState, fingerprint: string): boolean =>
  state.proofs.has(fingerprint) || state.listed.has(fingerprint) || state.inherited.has(fingerprint);

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
};

const isBinding = (value: unknown): boolean =>
  (typeof value === 'string' && value.includes('{{')) || (value !== null && typeof value === 'object' && Object.keys(value).some((key) => key.startsWith('$')));

// Models that reason send an untyped field as JSON in a string.
const jsonOrSelf = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const makeTools = (setup: ScreenSetup, state: BuildState): ToolDefinition[] => {
  const ambientValues = Object.entries(setup.ambient).map(([key, value]) => `${key} is ${JSON.stringify(value)}`).join(', ');

  // The context keys a query takes, from its proof or from what discover listed.
  const takes = (fingerprint: string): string[] => {
    const proof = state.proofs.get(fingerprint);
    if (proof !== undefined) return Object.entries(proof.context).filter(([, meta]) => meta.kind === 'context').map(([key, meta]) => `"${key}" (${meta.type ?? 'a value'})`);
    return Object.entries(state.listed.get(fingerprint) ?? {}).map(([key, field]) => `"${key}" (${field.type})`);
  };

  const discover = defineTool({
    id: 'screen.discover',
    name: 'discover',
    riskLevel: 'low',
    description: 'The data there is: every entity with its fields, and the queries that already exist, each with its intent and the context it takes.',
    input: z.object({}),
    execute: async () => {
      const found = await setup.vex.discover();
      const queries = found.fingerprints.filter((entry) => entry.kind === 'query');
      for (const entry of queries) state.listed.set(entry.fingerprint, entry.context);
      return {
        entities: found.entities.map((entity) => ({ entity: entity.name, fields: entity.fields.map((field) => `${field.name}: ${field.type}`) })),
        queries: queries.flatMap((entry) =>
          entry.intent === undefined
            ? []
            : [{ fingerprint: entry.fingerprint, intent: entry.intent, ...(entry.context !== undefined && Object.keys(entry.context).length > 0 ? { context: Object.fromEntries(Object.entries(entry.context).map(([key, field]) => [key, field.type])) } : {}) }],
        ),
      };
    },
  });

  const prove = defineTool({
    id: 'screen.prove',
    name: 'prove',
    riskLevel: 'low',
    description:
      'Run a query against the real data before the screen shows it: a new one (intent + shape + context) or one that exists (fingerprint + context). ' +
      'Answers the row count, two sample rows, the fingerprint that replays it, and the context it takes.',
    guide: () =>
      `${vexGuide()}\n\n` +
      'SHOWING WHAT YOU PROVED — an endpoint replays the fingerprint, and the reply is the rows themselves:\n' +
      `{ "url": "${setup.vex.endpoint}", "method": "POST", "request": { "fingerprint": "<from prove>", "context": { … } }, "target": "<data key>" }\n` +
      '- The request context sends every key of kind "context": a value that follows the screen is a binding over its data ({ "$ref": "$.month" }); keys of kind "scope" are filled by the server.\n' +
      '- A proof takes literal values, the ones the screen would send. To see the rows for another value, replay the fingerprint with it.\n' +
      '- Copy a fingerprint from a prove result, character for character.',
    input: z.object({
      fingerprint: z.string().optional().describe('Replays a query that exists: from discover or an earlier prove. Leave out for a new query.'),
      intent: z.string().optional().describe('A new query: plain English with every filter, sort, limit and derived value, named with real fields from discover.'),
      shape: z.unknown().optional().describe('A new query: a JSON example of one answer — [ { … } ] for a list of rows, { … } for one record. Not a string.'),
      context: z.record(z.string(), z.unknown()).optional().describe('The values the query takes, each named in the intent.'),
    }),
    execute: async ({ fingerprint, intent, shape: sentShape, context }) => {
      const values = (context ?? {}) as Record<string, unknown>;
      const bound = Object.entries(values).find(([, value]) => isBinding(value));
      if (bound !== undefined) {
        throw new Error(`a proof takes literal values: "${bound[0]}" is ${JSON.stringify(bound[1])}. {{…}} and {"$ref": …} belong in endpoints; send the value itself (${ambientValues}).`);
      }
      const shape = jsonOrSelf(sentShape);
      const notes: string[] = [];
      let replay = fingerprint;
      const identity = replay === undefined && intent !== undefined && shape !== undefined ? `${intent.trim()}|${JSON.stringify(canonical(shape))}` : undefined;
      if (replay === undefined) {
        if (identity === undefined) throw new Error('a new query needs an intent and a shape; one that exists needs its fingerprint');
        const asked = state.asked.get(identity);
        if (asked !== undefined) {
          replay = asked;
          notes.push(`You proved this intent already as ${asked}, so it was replayed with your context. Next time send { "fingerprint": "${asked}", "context": { … } }.`);
        }
      } else if (intent !== undefined || shape !== undefined) {
        notes.push('A replay runs the query as it was written: its columns, order and form. For others, describe a new query with intent and shape.');
      }

      const ask = async (request: QueryRequest): Promise<QueryResponse> => {
        try {
          return await setup.vex.execute(request);
        } catch (error) {
          const keys = request.fingerprint === undefined ? [] : takes(request.fingerprint);
          throw new Error(keys.length > 0 ? `${messageOf(error)} — the query takes ${keys.join(', ')}` : messageOf(error));
        }
      };
      let response = await ask(replay !== undefined ? { fingerprint: replay, context: values } : { intent, shape, context: values });

      // The values the host folds into every endpoint call: the model cannot know them, so the proof gets them.
      const unfilled = [...new Set(response.meta.missingContext ?? [])].filter((key) => Object.hasOwn(setup.ambient, key) && !Object.hasOwn(values, key));
      const minted = response.meta.cache.fingerprint;
      let sentValues = values;
      if (unfilled.length > 0 && minted !== undefined) {
        sentValues = { ...values, ...Object.fromEntries(unfilled.map((key) => [key, setup.ambient[key]])) };
        response = await ask({ fingerprint: minted, context: sentValues });
        notes.push(`Filled in ${unfilled.join(', ')} for this proof. Your endpoint sends ${unfilled.map((key) => `"${key}": { "$ref": "$.${key}" }`).join(' and ')}: every endpoint call carries them.`);
      }

      const proved = response.meta.cache.fingerprint;
      const missing = response.meta.missingContext ?? [];
      const rows = response.result;
      if (identity !== undefined && proved !== undefined && replay === undefined) state.asked.set(identity, proved);
      const answer = `${proved ?? ''}|${JSON.stringify(canonical(sentValues))}`;
      if (state.answered.has(answer)) notes.push('Identical to an earlier call: the answer is the same.');
      state.answered.add(answer);
      if (proved !== undefined && missing.length === 0) {
        state.proofs.set(proved, { count: Array.isArray(rows) ? rows.length : 1, context: response.meta.context, ...(intent === undefined ? {} : { intent }) });
      }
      if (missing.length > 0) notes.push(`NOT PROVEN: the query takes ${missing.map((key) => `"${key}"`).join(', ')} and ran without them, so these rows are wrong. Prove it again with a value for each.`);
      if (!Array.isArray(rows)) notes.push('One record, because the shape was an object. For a list of rows the shape is [ { … } ].');
      return {
        ...(Array.isArray(rows) ? { count: rows.length, sample: rows.slice(0, 2) } : { record: rows }),
        ...(proved !== undefined && missing.length === 0 ? { fingerprint: proved } : {}),
        context: response.meta.context,
        ...(missing.length > 0 ? { missing } : {}),
        ...((response.meta.warnings ?? []).length > 0 ? { warnings: response.meta.warnings } : {}),
        ...(notes.length > 0 ? { notes } : {}),
      };
    },
  });

  const check = defineTool({
    id: 'screen.check',
    name: 'check',
    riskLevel: 'low',
    timeoutMs: 180_000,
    description:
      'Mount the screen for real, load its data, and run its probes. Answers what broke, or that it passes — and a screen that passes is the result: the work ends there.',
    guide:
      'A probe is what a person does on the screen and what must follow: { "do": [ { "set": "<ref>", "to": "<value>" } ], "changes": "<data key>" } or ' +
      '{ "do": [ { "click": "<row or button ref>" } ], "opens": "<action id>" }. Every control or row whose trigger loads data or opens a screen needs one. ' +
      'Pick values that must change what loads.',
    input: z.object({
      action: z.record(z.string(), z.unknown()).describe('The complete action definition.'),
      probes: z.array(ProbeSchema).optional().describe('What the screen must do when it is used.'),
    }),
    execute: async ({ action, probes }) => {
      const result = await checkScreen(action, setup, { probes: probes ?? [], proofs: state.proofs, replayable: (fingerprint) => replayable(state, fingerprint) });
      const parsed = ActionDefinitionSchema.safeParse(action);
      if (result.ok && parsed.success) {
        state.passed = { action: parsed.data, probes: probes ?? [] };
        return { ok: true, loaded: result.loaded };
      }
      state.last = { action, findings: result.findings };
      return { ok: false, findings: result.findings.map((finding) => finding.message), loaded: result.loaded };
    },
  });

  return [discover, prove, check];
};
