// The app boots, the charter verifies, and each principal's shell is the
// application their role describes — no more canvases, no fewer, and only the
// actions they hold.
//
// Booting IS the first assertion: moss refuses an incoherent charter, a
// malformed definition and a mutation entry that fails its lint, so reaching
// the first line of `main` means all three held.
import { verifyCharter } from '@niscorp/charter';
import { resolveCatalog } from '@niscorp/moss';
import { scopeGrants } from '@niscorp/vex';
import { z } from 'zod';
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { inputContractOf } from '@encore/server/intent/input-contract';
import { app, asPrincipal, check, login, mounted, report, runtime, settle } from './world';

// Exactly these, no more and no fewer. Slice 1b added `assist` — the slow path's
// one card — and the assertion grew with the manifest rather than loosening.
// (2026-09-21, scene 4: `watch`, `attention` and `deck` joined the frame.)
// (2026-09-21, the surface: `xray` — the one switch — joined the frame.)
// (2026-09-21, the redesign: `marker` — x-ray's "instruments visible" banner — joined it.)
const CANVASES = ['marker', 'line', 'assist', 'rail', 'watch', 'attention', 'deck', 'xray', 'doing', 'about', 'where', 'when', 'nearby', 'maybe', 'warm', 'trace'];

const RowsSchema = z.object({ result: z.array(z.record(z.string(), z.unknown())) });

// Everything the manifest carries as DATA must be JSON and nothing else: a
// function, a Date, an undefined or a class instance in an artifact is a code
// file wearing a data file's name (AGENTS.md review item 6a). Returns the paths
// that are not.
const impure = (value: unknown, path: string): string[] => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => impure(item, `${path}[${index}]`));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.entries(value).flatMap(([key, item]) => impure(item, `${path}.${key}`));
  return [path];
};

const main = async (): Promise<void> => {
  // ═══ 1. the charter, asked the way moss asks it ══════════
  const tables = await runtime.pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'vex_cache'`);
  const data = scopeGrants(tables.rows.map((row) => String(row['table_name'])));
  const verdict = verifyCharter(app.charter, { actions: Object.keys(app.actions), data });
  check(`the charter verifies with no errors (${verdict.errors.map((issue) => issue.detail).join('; ') || 'none'})`, verdict.errors.length === 0);
  check(`...and leaves no action orphaned (${verdict.warnings.filter((issue) => issue.rule === 'orphan').length})`, !verdict.warnings.some((issue) => issue.rule === 'orphan'));

  // ═══ 2. the operator's shell ═════════════════════════════
  const operator = await login(OPERATOR_PRINCIPAL);
  await settle();
  const state = operator.getState();
  check(`the operator shell has exactly its ${CANVASES.length} canvases (${Object.keys(state.canvases).join(', ')})`, CANVASES.every((id) => state.canvases[id] !== undefined) && Object.keys(state.canvases).length === CANVASES.length);
  check('...the line canvas holds the intent line', mounted(operator, 'line').join() === 'intent.line');
  check('...the chip strip and the trace are furniture, mounted at boot', mounted(operator, 'maybe').join() === 'intent.options' && mounted(operator, 'trace').join() === 'intent.trace');
  check('...and every question canvas starts empty — the slow path’s included', ['assist', 'doing', 'about', 'where', 'when', 'nearby', 'warm'].every((id) => mounted(operator, id).length === 0));

  const frame = JSON.stringify(operator.flattenRenderTree(operator.getShellRenderTree()));
  // The room arrives through `{ ref: 'room' }`. (Restated 2026-09-21, the redesign: the
  // arrangement is ONE packed flow now, not three columns with a `basis` — so what
  // proves the ref resolved is the Pack, which is nowhere in the frame's own layout.)
  check('the frame renders, with the room resolved through its layout ref', frame.includes('"name":"Pack"') && !frame.includes('"type":"error"'));

  // ═══ 3. ring 1, from the resolver ════════════════════════
  const operatorIds = resolveCatalog(app, OPERATOR_PRINCIPAL).ids;
  const liaisonIds = resolveCatalog(app, LIAISON_PRINCIPAL).ids;
  check(`the operator holds every action the app ships (${operatorIds.length})`, operatorIds.length === Object.keys(app.actions).length);
  check('the liaison holds the line, and does NOT hold the slot swap', liaisonIds.includes('intent.line') && !liaisonIds.includes('slot.swap'));
  check(`...a narrow subset (${liaisonIds.join(', ')})`, liaisonIds.length < operatorIds.length && liaisonIds.every((id) => operatorIds.includes(id)));
  check('an anonymous principal resolves to no application at all', resolveCatalog(app, null).ids.length === 0);

  // ═══ 4. the contracts the loop will read ═════════════════
  // Rule 14, checked: every declared input is a key of the action's data. A
  // field the model can fill that the card cannot hold is a silent no-op.
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

  // The two SEAMS are functions by contract — `functions` is what actions call,
  // `runs` is where agent runs are recorded — and everything else is an artifact.
  // (2026-09-21, scene 4: `reactions` is the third seam — what runs when a watched
  // table is written. Its TABLE LIST is data; its `run` is a function by contract.)
  const { functions: _functions, runs: _runs, reactions: _reactions, ...artifacts } = app;
  const notJson = impure(artifacts, 'app');
  check(`every artifact in the manifest is pure JSON (${notJson.slice(0, 3).join(', ') || 'all of it'})`, notJson.length === 0);

  // ═══ 5. one read, end to end, on the raw wire ════════════
  const lineup = await asPrincipal(OPERATOR_PRINCIPAL, '/api/lineup/vex', { fingerprint: 'lineup/forDay', context: { day: 'sat' } });
  const rows = RowsSchema.safeParse(lineup.json);
  check(`the operator reads Saturday's running order (${rows.success ? rows.data.result.length : 0} sets)`, rows.success && rows.data.result.length === 9); // 7 until slice 2a seeded two more Saturday-evening open-air sets, so the storm exposes THREE (SCENARIOS.md scene 1).
  check('...with the generated minute columns the timeline draws from', rows.success && rows.data.result.some((row) => row['act_name'] === 'Nova Kestrel' && row['start_min'] === 1290 && row['end_min'] === 1380));

  const heat = RowsSchema.safeParse((await asPrincipal(OPERATOR_PRINCIPAL, '/api/site/vex', { fingerprint: 'zones/heat', context: { day: 'sat', hour: 21 } })).json);
  check('zone heat arrives as a NUMBER between 0 and 1, computed in the query', heat.success && heat.data.result.length === 6 && heat.data.result.every((row) => typeof row['heat'] === 'number' && row['heat'] >= 0 && row['heat'] <= 1));

  const refused = await asPrincipal(LIAISON_PRINCIPAL, '/api/lineup/vex', { fingerprint: 'lineup/forDay', context: { day: 'sat' } });
  check(`the liaison is refused the same read by the engine (${refused.status})`, refused.status >= 400 && !JSON.stringify(refused.json).includes('Nova Kestrel'));

  // The trigram path: a typo'd NAME still finds its act. This is the half of
  // candidate retrieval `ilike` cannot do.
  const fuzzy = RowsSchema.safeParse((await asPrincipal(OPERATOR_PRINCIPAL, '/api/vex', { fingerprint: 'candidates/acts', context: { p1: '%kestrl%', t1: 'kestrl' } })).json);
  check('pg_trgm is live: "kestrl" finds Nova Kestrel', fuzzy.success && fuzzy.data.result.some((row) => row['id'] === 'act_nova_kestrel'));

  await report('boot-check');
};

void main();
