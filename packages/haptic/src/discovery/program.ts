import { Ajv2020 } from 'ajv/dist/2020.js';
import { evaluate, type Config } from '@niscorp/prism';
import { mappingAgent } from '@niscorp/prism/agent';
import type { CheerioAPI } from 'cheerio';
import type { ExtractedRecord } from '../artifact/stage.js';
import type { FieldRule } from '../artifact/schema.js';
import type { Calls } from './calls.js';
import { compareExamples, compareLabels, labelRetry, labelsDiffer } from './findings.js';
import type { Label } from './members.js';
import { MAPPING_NOTES } from './prompts.js';
import type { Example } from './read.js';

export type JsonSchema = Record<string, unknown>;
export type Program = { program: Config; data: unknown; by: 'code' | 'model' };

const clip = (value: string, n: number) => (value.length > n ? `${value.slice(0, n)}…` : value);

// A Prism program that copies each record's fields into one result item.
export const copyProgram = (names: string[]): Config =>
  ({
    $map: {
      over: { $ref: '$.records' },
      as: 'r',
      body: Object.fromEntries(
        names.map((k) => [k, { $get: { from: { $var: 'r' }, path: ['fields', k] } }]),
      ),
    },
  }) as unknown as Config;

// Without a caller's schema: one item per record, one property per cited field (a list where lines were cited).
export const inferSchema = (examples: Example[]): JsonSchema => {
  const properties: Record<string, unknown> = {};
  for (const example of examples)
    for (const [k, cited] of Object.entries(example))
      properties[k] = cited.some((c) => c.kind === 'lines')
        ? { type: ['array', 'null'], items: { type: 'string' } }
        : { type: ['string', 'null'] };
  return { type: 'array', items: { type: 'object', properties } };
};

const example = (schema: unknown): unknown => {
  const s = (schema ?? {}) as {
    type?: unknown;
    properties?: Record<string, unknown>;
    items?: unknown;
  };
  const type = [s.type].flat().find((t) => t !== 'null');
  if (type === 'object')
    return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, example(v)]));
  if (type === 'array') return [example(s.items ?? {})];
  if (type === 'number' || type === 'integer') return 0;
  return '';
};

const schemaProperties = (schema: JsonSchema) =>
  schema.type === 'array'
    ? Object.keys(
        ((schema.items as JsonSchema | undefined)?.properties as object | undefined) ?? {},
      )
    : [];

// The program that shapes the records. Code copies the fields when nothing is left to filter, every property of the
// result schema is a stage field, and the copied values fit. Otherwise Prism's mapping agent writes it; its program
// must keep every cited example and is asked once to match the labels. The last program that kept every example
// stands when none also matches the labels.
export const writeProgram = async ({
  calls,
  instruction,
  schema,
  records,
  kept,
  examples,
  $,
  base,
  labels,
  where,
  fields,
  sampleBytes,
  steps,
}: {
  calls: Calls;
  instruction: string;
  schema: JsonSchema;
  records: ExtractedRecord[];
  kept: ExtractedRecord[];
  examples: Example[];
  $: CheerioAPI;
  base: string;
  labels: Label[] | null;
  where: boolean;
  fields: Record<string, FieldRule>;
  sampleBytes: number;
  steps: number;
}): Promise<Program | null> => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const fits = ajv.compile(schema);
  const leftToFilter = Boolean(labels && !where && labels.some((l) => !l.keep));
  const properties = schemaProperties(schema);
  if (!leftToFilter && properties.length && properties.every((k) => k in fields)) {
    const program = copyProgram(properties);
    const data = evaluate(program, { records: kept }, { check: 'always' });
    calls.event('map', { type: 'copy', fits: fits(data) });
    if (fits(data)) return { program, data, by: 'code' };
  }

  const sample: ExtractedRecord[] = [];
  for (const r of kept) {
    if (JSON.stringify(sample).length + JSON.stringify(r).length > sampleBytes && sample.length)
      break;
    sample.push(r);
  }
  const found: { mapped: Program | null; passed: Program | null } = { mapped: null, passed: null };
  // Labels are asked about only when code found no phrase, and once; a second mismatch is a finding.
  const asking = Boolean(labels && !where);
  let labelsAsked = false;
  await calls.agent<Config>({
    job: 'map',
    base: mappingAgent.config,
    steps,
    input: {
      sampleInput: { records: sample },
      targetShape: example(schema),
      fieldDescriptions: {},
      notes: `${MAPPING_NOTES(instruction)}\nThe sample shows ${sample.length} of ${kept.length} records.\nRESULT SCHEMA (what the program returns; your data is still the program):\n${JSON.stringify(schema)}`,
    },
    validate: (program) => {
      let data: unknown;
      try {
        data = evaluate(program, { records: kept }, { check: 'always' });
      } catch (error) {
        return `Running the program on all ${kept.length} records failed: ${(error as Error).message}`;
      }
      if (!fits(data))
        return `The program's result does not match the RESULT SCHEMA: ${ajv.errorsText(fits.errors)}. First items: ${clip(JSON.stringify(data), 800)}`;
      const { missing } = compareExamples(data, examples, $, base, kept);
      if (!missing.length) found.passed = { program, data, by: 'model' };
      const gap = asking && labels ? compareLabels(data, labels, records, fields) : null;
      if (gap && labelsDiffer(gap) && !labelsAsked) {
        labelsAsked = true;
        return labelRetry(gap);
      }
      if (missing.length)
        return `These items answer the request but are not in the result:\n${missing.map((m) => `- ${clip(JSON.stringify(m), 400)}`).join('\n')}\nChange the program so the result contains them.`;
      found.mapped = { program, data, by: 'model' };
      return null;
    },
  });
  return found.mapped ?? found.passed;
};
