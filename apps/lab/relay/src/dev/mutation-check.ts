// Mutations (write phase). Drives a CREATE end-to-end through the real Nova path
// — open the form modal, fill it, confirm — and proves the row lands in PGlite
// and the list re-reads to show it. Also checks the security model: identity is
// stamped by the ENGINE from the scope policy (never authorable in the DSL), the
// input prism bridges form → columns, plus DB-defaulted id and the closed-grammar
// gates. Run: pnpm --filter relay exec tsx src/dev/mutation-check.ts
import { evaluate } from '@niscorp/prism';
import { shell } from '../nova/shell';
import { getVexRuntime } from '../vex/runtime';
import { executeMutation, MutationDefinitionSchema } from '../vex/mutations';
import { scopePolicy } from '../vex/scope';
import { companyUpsert } from '@relay/api/companies';
import { contactUpsert } from '@relay/api/contacts';
import { dealUpsert } from '@relay/api/deals';
import { upsertContactPrism } from '../nova/domains/contact/contact.form.prism';

const settle = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));
const mainData = (): Record<string, unknown> | undefined => {
  const a = shell.getCanvasState('main').active;
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const companyRows = (): Array<Record<string, unknown>> => (mainData()?.['rows'] ?? []) as Array<Record<string, unknown>>;
const modalRt = (): ReturnType<typeof shell.getRuntime> => {
  const a = shell.getCanvasState('modal').active;
  return a !== undefined ? shell.getRuntime(a.id) : undefined;
};

const main = async (): Promise<void> => {
  const rt = await getVexRuntime();
  const schema = rt.engine.getSchema();
  if (schema === undefined) {
    console.log('FAIL — Vex schema not introspected.');
    process.exit(1);
  }
  const checks: [string, boolean][] = [];

  // ── Engine: a direct upsert with NO id desugars to insert — proves the DB write
  // + RETURNING + scope + id default.
  const inserted = await executeMutation(rt.db, companyUpsert, {
    context: { name: 'Probe Inc', domain: 'probe.io', industry: 'finance', size: '1-10' },
    scope: { userId: 'usr_001' },
    policy: scopePolicy,
    schema,
  });
  const row = inserted[0] ?? {};
  checks.push([`insert returns the row (name=${String(row['name'])})`, row['name'] === 'Probe Inc']);
  checks.push([`id defaulted in the DB (got "${String(row['id']).slice(0, 8)}…")`, typeof row['id'] === 'string' && row['id'] !== '']);
  // Relay's scope policy carries a `set` rule (owner_id ← userId). The engine
  // stamps it on insert from the scope's userId — applied after parse, never from
  // the DSL, so a generated/injected entry can't place, omit, or redirect it.
  checks.push([`engine stamps owner from the scope policy (got ${String(row['owner_id'])})`, row['owner_id'] === 'usr_001']);

  // And `$scope` simply cannot be authored in a mutation — rejected at parse, so
  // the owner-forging swap ($scope → $context) has nothing to target.
  let scopeInDslRejected = false;
  try {
    MutationDefinitionSchema.parse({ op: 'insert', table: 'companies', values: { owner_id: { $scope: 'userId' } } });
  } catch {
    scopeInDslRejected = true;
  }
  checks.push(['`$scope` cannot be authored in a mutation (rejected at parse)', scopeInDslRejected]);

  // ── The seam: the form's data (a single "Name", a "Relationship") is mapped to
  // DB columns by the input prism — split name → first/last, drop relationship —
  // BEFORE the write. Action shape ≠ DB shape.
  // The prism is now the full request body `{ mutation, context }`; the input seam
  // we're testing is its `.context` (form data → DB columns).
  const ctx = (evaluate(upsertContactPrism, {
    id: '', // the form always carries an id (default ''); empty → the upsert inserts
    name: 'Ada Lovelace',
    email: 'ada@analytical.io',
    phone: '+1 (555) 010-1010',
    title: 'Engineer',
    company: '',
    relationship: 'lead',
  }) as { context: Record<string, unknown> }).context;
  const contactRow = (await executeMutation(rt.db, contactUpsert, { context: ctx, scope: { userId: 'usr_001' }, policy: scopePolicy, schema }))[0] ?? {};
  checks.push([`prism splits "Ada Lovelace" → first/last (${String(contactRow['first_name'])}/${String(contactRow['last_name'])})`, contactRow['first_name'] === 'Ada' && contactRow['last_name'] === 'Lovelace']);
  checks.push(['form-only "relationship" (no column) never reaches the row', !('relationship' in contactRow)]);

  // ── Update: the SAME upsert WITH an id desugars to update — edits by id.
  const edited = (await executeMutation(rt.db, contactUpsert, {
    context: { id: contactRow['id'], first_name: 'Augusta', last_name: 'King', email: 'augusta@x.io', phone: '', title: 'Countess', company_id: null },
    scope: { userId: 'usr_001' }, policy: scopePolicy, schema,
  }))[0] ?? {};
  checks.push([`upsert with id edits the row (${String(contactRow['first_name'])} → ${String(edited['first_name'])})`, edited['first_name'] === 'Augusta' && edited['id'] === contactRow['id']]);

  // ── Deal create: real FK ids (company + stage), owner stamped, status defaults.
  const co = (await rt.db.query('SELECT id FROM companies LIMIT 1')).rows[0] as { id: string };
  const stg = (await rt.db.query("SELECT id FROM stages WHERE name='Lead' LIMIT 1")).rows[0] as { id: string };
  const newDeal = (await executeMutation(rt.db, dealUpsert, {
    context: { title: 'Engine Deal', company_id: co.id, stage_id: stg.id, primary_contact_id: null, value: 1000, close_date: null },
    scope: { userId: 'usr_001' }, policy: scopePolicy, schema,
  }))[0] ?? {};
  checks.push([`deal create writes FK ids + stamps owner (stage=${String(newDeal['stage_id'])}, owner=${String(newDeal['owner_id'])}, status=${String(newDeal['status'])})`, newDeal['stage_id'] === stg.id && newDeal['owner_id'] === 'usr_001' && newDeal['status'] === 'open']);

  // ── Safety gates.
  let unknownColRejected = false;
  try {
    await executeMutation(rt.db, { op: 'insert', table: 'companies', values: { naem: 'x' } } as never, { context: {}, scope: {}, policy: scopePolicy, schema });
  } catch {
    unknownColRejected = true;
  }
  checks.push(['unknown column rejected before any SQL runs', unknownColRejected]);

  let blankWriteRejected = false;
  try {
    MutationDefinitionSchema.parse({ op: 'update', table: 'companies', set: { name: 'x' }, where: {} });
  } catch {
    blankWriteRejected = true;
  }
  checks.push(['blanket update (empty WHERE) rejected by the schema', blankWriteRejected]);

  // ── End-to-end through the shell: open the form, fill it, confirm.
  shell.dispatch({ type: 'ui:click', ref: 'nav-companies' });
  await settle();
  const before = companyRows().length;
  shell.publish('new'); // same channel the topbar's "+ New" emits
  await settle();
  // No `id` in the form data → the `company.upsert` write desugars to insert.
  modalRt()?.setData({ id: '', name: 'Shell Co', domain: 'shell.co', industry: 'technology', size: '11-50', modalTitle: 'New company', confirmLabel: 'Create' });
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(300);
  const rows = companyRows();
  checks.push([`list grew after create (${before} → ${rows.length})`, rows.length === before + 1]);
  checks.push(['the new company is in the re-read list', rows.some((r) => r['name'] === 'Shell Co')]);
  checks.push(['modal closed on success', shell.getCanvasState('modal').active === undefined]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — creates write to PGlite via the mutation engine; the list re-reads live.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
