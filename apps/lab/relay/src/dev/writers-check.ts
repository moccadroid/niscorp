import { execute } from '@niscorp/prism';
import type { JsonObject } from '@niscorp/prism';
import type { SignalClient } from '@niscorp/cortex';
import { selectContext, type Decider } from '@relay/context-selection';
import { compactSchema, declaredMapping, DSL_SCHEMA, DSL_SPEC, shapeWriter, storedShape } from '@relay/server/functions/ray/writers';
import { getVexRuntime } from './engine';

// relay's vex writers and context selection with no model: each case is one thing they must do.
const checks: [string, boolean][] = [];

const strings = (value: unknown, key: string): string[] => {
  if (Array.isArray(value)) return value.flatMap((one) => strings(one, key));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([name, inner]) => [...(name === key && typeof inner === 'string' ? [inner] : []), ...strings(inner, key)]);
};
const propertyNames = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(propertyNames);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record['properties'] !== null && typeof record['properties'] === 'object' ? Object.keys(record['properties'] as object) : [];
  return [...own, ...Object.values(record).flatMap(propertyNames)];
};
const enums = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(enums);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [...(Array.isArray(record['enum']) ? record['enum'].map((one) => JSON.stringify(one)) : []), ...Object.values(record).flatMap(enums)];
};
const missingFrom = (text: string, wanted: readonly string[]): string[] => [...new Set(wanted)].filter((one) => !text.includes(one));

const lostDescriptions = missingFrom(DSL_SPEC, strings(DSL_SCHEMA, 'description'));
const lostNames = missingFrom(DSL_SPEC, propertyNames(DSL_SCHEMA).map((name) => `${name}`));
const lostEnums = missingFrom(DSL_SPEC, enums(DSL_SCHEMA));
checks.push([`the compact DSL keeps every description, property and allowed value, in ${DSL_SPEC.length} characters of ${JSON.stringify(DSL_SCHEMA).length} (lost: ${[...lostDescriptions, ...lostNames, ...lostEnums].slice(0, 3).join(' | ') || 'none'})`, lostDescriptions.length + lostNames.length + lostEnums.length === 0 && DSL_SPEC.length < JSON.stringify(DSL_SCHEMA).length]);

const { engine } = await getVexRuntime();
const schema = engine.getSchema();
if (schema === undefined) throw new Error('the dev engine has no schema');
const schemaText = compactSchema(schema);
const lostFields = schema.entities.flatMap((entity) => [entity.name, ...entity.fields.map((field) => field.name)]).filter((name) => !schemaText.includes(name));
checks.push([`the compact schema names every entity and field, in ${schemaText.length} characters of ${JSON.stringify(schema).length} (lost: ${lostFields.slice(0, 3).join(', ') || 'none'})`, lostFields.length === 0]);

// A model that must not be asked: a shape prism can map never reaches it.
const asked = (): never => {
  throw new Error('the mapping agent was asked');
};
const refusing = { step: asked, stepStream: asked, count: asked, describe: asked } as unknown as SignalClient;
const map = shapeWriter(refusing);
const declaredShape = [{ id: '', title: '', close_date: '', close_date_display: { $date: { value: { $ref: '$.close_date' }, format: 'MMM D' } } }];
const rows = [{ id: 'd1', title: 'Wayne — Onboarding', close_date: '2026-06-08', extra: 1 }];
const declared = await map(rows, declaredShape, 'deals');
const wanted = [{ id: 'd1', title: 'Wayne — Onboarding', close_date: '2026-06-08', close_date_display: 'Jun 8' }];
checks.push([`a declared format is computed by prism, beside the stored date it reads (${JSON.stringify(declared.transformed)})`, JSON.stringify(declared.transformed) === JSON.stringify(wanted)]);
const replayed = execute(declared.ir, { result: [{ id: 'd2', title: 'Acme', close_date: '2026-07-01' }], context: {}, scope: {} } as unknown as JsonObject);
checks.push([`the mapping replays on other rows the way vex replays a stored one (${JSON.stringify(replayed)})`, JSON.stringify(replayed) === JSON.stringify([{ id: 'd2', title: 'Acme', close_date: '2026-07-01', close_date_display: 'Jul 1' }])]);

const single = await map([{ open: 5 }], { open: 0 }, 'the number of my open tasks');
checks.push([`a single-record shape is mapped too (${JSON.stringify(single.transformed)})`, JSON.stringify(single.transformed) === '{"open":5}']);

const stored = storedShape(declaredShape);
checks.push([`the query is asked for the stored fields a declared one reads (${JSON.stringify(stored.shape)})`, stored.declared && JSON.stringify(stored.shape) === '[{"id":"","title":"","close_date":""}]']);
const onlyDeclared = storedShape([{ id: '', due_display: { $date: { value: { $ref: '$.due_date' }, format: 'MMM D' } } }]);
checks.push([`a stored field read only by a declared one is added to the query's shape (${JSON.stringify(onlyDeclared.shape)})`, JSON.stringify(onlyDeclared.shape) === '[{"id":"","due_date":""}]']);

checks.push([`a shape that shows a form only by example is left to the mapping agent`, declaredMapping([{ id: '', close_date_display: 'Apr 6' }]) === undefined]);
const fellBack = await map([{ id: 'd1' }], [{ id: '', title: '' }], 'deals').then(() => 'mapped', (error: unknown) => (error instanceof Error ? error.message : String(error)));
checks.push([`rows without a field the shape names are left to the mapping agent (${fellBack})`, fellBack.includes('the mapping agent was asked')]);

const pieces = [
  { id: 'deals', about: 'deals: id, title, company_id', content: 'DEALS', with: ['companies'] },
  { id: 'companies', about: 'companies: id, name', content: 'COMPANIES' },
  { id: 'tasks', about: 'tasks: id, title, due_date', content: 'TASKS' },
];
const answering = (yes: readonly number[]): Decider => ({
  decide: (async () => ({ calibrated: true, decisions: Object.fromEntries(pieces.map((_, at) => [`p${at}`, { answer: yes.includes(at), noul: yes.includes(at) ? 0.9 : 0.1 }])), meta: {} })) as unknown as Decider['decide'],
});
const picked = await selectContext({ decider: answering([0]), request: { intent: 'deals with their company name' }, pieces, noun: 'entity' });
checks.push([`a picked piece brings the pieces it goes with, and the rest are listed (${picked.taken.join(', ')}; left ${picked.left.map((one) => one.id).join(', ')})`, picked.taken.join(',') === 'deals,companies' && picked.left.map((one) => one.id).join(',') === 'tasks' && picked.content === 'DEALS\nCOMPANIES']);
const none = await selectContext({ decider: answering([]), request: {}, pieces });
checks.push([`a decider that takes nothing leaves everything in (${none.taken.join(', ')})`, none.taken.length === 3 && none.left.length === 0]);
const failing = await selectContext({ decider: { decide: (() => Promise.reject(new Error('down'))) as unknown as Decider['decide'] }, request: {}, pieces });
checks.push([`a decider that fails leaves everything in and says why (${failing.failed ?? ''})`, failing.taken.length === 3 && failing.failed === 'down']);

for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
console.log(checks.every(([, ok]) => ok) ? '\nOK — relay\'s vex writers and context selection (no LLM).' : '\nFAIL.');
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
