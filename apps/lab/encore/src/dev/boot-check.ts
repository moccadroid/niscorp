import { verifyCharter } from '@niscorp/charter';
import { scopeGrants } from '@niscorp/vex';
import { z } from 'zod';
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { inputContractOf } from '@encore/server/intent/input-contract';
import { app, asPrincipal, check, login, mounted, report, runtime, server, settle } from './world';

const CANVASES = ['line', 'assist', 'rail', 'watch', 'attention', 'deck', 'doing', 'about', 'where', 'when', 'nearby', 'maybe', 'warm', 'trace'];

const RowsSchema = z.object({ result: z.array(z.record(z.string(), z.unknown())) });

const impure = (value: unknown, path: string): string[] => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => impure(item, `${path}[${index}]`));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.entries(value).flatMap(([key, item]) => impure(item, `${path}.${key}`));
  return [path];
};

const main = async (): Promise<void> => {
  const tables = await runtime.pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'vex_cache'`);
  const data = scopeGrants(tables.rows.map((row) => String(row['table_name'])));
  const verdict = verifyCharter(app.charter, { actions: Object.keys(app.actions), data });
  check(`the charter verifies with no errors (${verdict.errors.map((issue) => issue.detail).join('; ') || 'none'})`, verdict.errors.length === 0);
  check(`...and leaves no action orphaned (${verdict.warnings.filter((issue) => issue.rule === 'orphan').length})`, !verdict.warnings.some((issue) => issue.rule === 'orphan'));

  const operator = await login(OPERATOR_PRINCIPAL);
  await settle();
  const state = operator.getState();
  check(`the operator shell has exactly its ${CANVASES.length} canvases (${Object.keys(state.canvases).join(', ')})`, CANVASES.every((id) => state.canvases[id] !== undefined) && Object.keys(state.canvases).length === CANVASES.length);
  check('...the line canvas holds the intent line', mounted(operator, 'line').join() === 'intent.line');
  check('...the chip strip and the trace are furniture, mounted at boot', mounted(operator, 'maybe').join() === 'intent.options' && mounted(operator, 'trace').join() === 'intent.trace');
  check('...and every question canvas starts empty — the slow path’s included', ['assist', 'doing', 'about', 'where', 'when', 'nearby', 'warm'].every((id) => mounted(operator, id).length === 0));

  const frame = JSON.stringify(operator.flattenRenderTree(operator.getShellRenderTree()));
  // The Pack is nowhere in the frame's own layout: it proves the `room` ref resolved.
  check('the frame renders, with the room resolved through its layout ref', frame.includes('"name":"Pack"') && !frame.includes('"type":"error"'));

  const operatorIds = (await server.catalogOf(OPERATOR_PRINCIPAL)).ids;
  const liaisonIds = (await server.catalogOf(LIAISON_PRINCIPAL)).ids;
  check(`the operator holds every action the app ships (${operatorIds.length})`, operatorIds.length === Object.keys(app.actions).length);
  check('the liaison holds the line, and does NOT hold the slot swap', liaisonIds.includes('intent.line') && !liaisonIds.includes('slot.swap'));
  check(`...a narrow subset (${liaisonIds.join(', ')})`, liaisonIds.length < operatorIds.length && liaisonIds.every((id) => operatorIds.includes(id)));
  check('an anonymous principal resolves to no application at all', (await server.catalogOf(null)).ids.length === 0);

  const strays = Object.keys(CANVAS_PLACEMENT).flatMap((id) => {
    const definition = app.actions[id];
    if (definition === undefined) return [`${id}: placed but not shipped`];
    const keys = new Set(Object.keys(definition.data ?? {}));
    return inputContractOf(definition)
      .fields.filter((field) => !keys.has(field.name))
      .map((field) => `${id}.${field.name}`);
  });
  check(`every placed action ships, and every input field is a data key (${strays.join(', ') || 'none stray'})`, strays.length === 0);
  check('every placed action says what it is, for a model choosing among them', Object.keys(CANVAS_PLACEMENT).every((id) => (app.actions[id]?.description ?? '').length > 40));
  check('`.meta({ ref })` survives into the served contract', inputContractOf(app.actions['slot.swap'] ?? { id: '' }).fields.find((field) => field.name === 'toStageId')?.ref === 'stages');

  const { functions: _functions, runs: _runs, reactions: _reactions, ...artifacts } = app;
  const notJson = impure(artifacts, 'app');
  check(`every artifact in the manifest is pure JSON (${notJson.slice(0, 3).join(', ') || 'all of it'})`, notJson.length === 0);

  const lineup = await asPrincipal(OPERATOR_PRINCIPAL, '/api/lineup/vex', { fingerprint: 'lineup/forDay', context: { day: 'sat' } });
  const rows = RowsSchema.safeParse(lineup.json);
  check(`the operator reads Saturday's running order (${rows.success ? rows.data.result.length : 0} sets)`, rows.success && rows.data.result.length === 9);
  check('...with the generated minute columns the timeline draws from', rows.success && rows.data.result.some((row) => row['act_name'] === 'Nova Kestrel' && row['start_min'] === 1290 && row['end_min'] === 1380));

  const heat = RowsSchema.safeParse((await asPrincipal(OPERATOR_PRINCIPAL, '/api/site/vex', { fingerprint: 'zones/heat', context: { day: 'sat', hour: 21 } })).json);
  check('zone heat arrives as a NUMBER between 0 and 1, computed in the query', heat.success && heat.data.result.length === 6 && heat.data.result.every((row) => typeof row['heat'] === 'number' && row['heat'] >= 0 && row['heat'] <= 1));

  const refused = await asPrincipal(LIAISON_PRINCIPAL, '/api/lineup/vex', { fingerprint: 'lineup/forDay', context: { day: 'sat' } });
  check(`the liaison is refused the same read by the engine (${refused.status})`, refused.status >= 400 && !JSON.stringify(refused.json).includes('Nova Kestrel'));

  const fuzzy = RowsSchema.safeParse((await asPrincipal(OPERATOR_PRINCIPAL, '/api/vex', { fingerprint: 'candidates/acts', context: { p1: '%kestrl%', t1: 'kestrl' } })).json);
  check('pg_trgm is live: "kestrl" finds Nova Kestrel', fuzzy.success && fuzzy.data.result.some((row) => row['id'] === 'act_nova_kestrel'));

  await report('boot-check');
};

void main();
