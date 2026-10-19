import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CortexEvent } from '@niscorp/cortex';
import { buildScreen } from '@relay/screen-builder';
import { screenSetup } from '@relay/server/functions/ray/screens';
import { shell, runtime } from './check-shell';
import { assign, isEffort, isModelId, llmFor } from '@relay/server/llm';
import { todayStr } from '@relay/lib/date';
import { devRayContext } from './engine';

// The suite builds as alex (usr_001) with the sales and dev roles: tasks are read through the assignee rule, so
// every task truth below is alex's.
const ME = 'usr_001';

const CORE: Record<string, string> = {
  top10: 'A table of the top 10 open deals by value, showing company, stage, value and close date. Click a row to open that deal.',
  byMonth:
    'A screen listing all deals whose close date falls in a selected month. A dropdown offers June, July and ' +
    'August; picking one reloads the table. Columns: deal title, company name, stage, value, close date. ' +
    'Clicking a row opens that deal (crm.deal.view).',
  search: 'A searchable table of all companies showing name, industry and size. Typing in the search box filters the list live; clicking a row opens that company.',
  overview:
    'A pipeline overview: a headline KPI with the total value of open deals, and below it a table of pipeline ' +
    'stages with the open-deal count and combined value per stage, sorted by combined value descending. ' +
    'Clicking a stage row opens the deals list.',
  workspace:
    'A my-day workspace: my open tasks ordered by due date, a KPI of how many of my tasks are overdue, and a ' +
    'table of my 5 biggest open deals (company, value, close date) where clicking a deal opens it. ' +
    'A "New task" button opens the task form.',
  feed: 'A recent-activity feed: the 30 most recent activities (calls, emails, meetings, notes) showing type, subject and when it happened, newest first.',
  wonlost: 'A table of deal owners showing, per owner, the owner name, how many deals they have won and how many they have lost, sorted by won count descending.',
  tasksWeek: 'A table of all open tasks due in the next 7 days (today included), ordered by due date, showing title, assignee name and due date.',
  rayIntent:
    'Create a new screen on the main canvas that shows a dropdown to select a month (June, July, August). ' +
    'The selected month filters the deals displayed in a table to only those with a close_date in that month. ' +
    'The table columns are: title, company, stage, value, close date. Clicking a row opens the deal view ' +
    '(crm.deal.view) for that deal. The table should refresh automatically when the month dropdown changes. ' +
    'Default view shows June deals. Include sorting by close date ascending.',
  expiry: 'A screen that lets me filter deals by expiry date: pick a from and a to date, and the table shows the deals closing between them.',
};

// Screens the builder was never shown an example of: choices loaded from data, two filters at once, tabs, a checkbox,
// and a row click that narrows another table. Paging is left out: vex's queries take a limit and no offset.
const HARD: Record<string, string> = {
  companyDeals: "Pick a company from a dropdown that lists every company; the table below shows that company's deals with title, stage and value. Clicking a deal opens it.",
  stageAndSearch: 'All deals in a table with title, stage and value, a dropdown to narrow them to one pipeline stage, and a search box on the deal title; both narrow the table together.',
  statusTabs: 'Deals with tabs Open, Won and Lost; clicking a tab shows the deals with that status, latest close date first, with title, value and close date.',
  hideClosed: 'All deals in a table with title, status and value, and a checkbox "Hide closed deals": when it is checked only open deals are listed.',
  stageDrill: 'Two tables: the open deals per pipeline stage (stage, count, combined value), and below it the open deals of the stage I click in the first table, with title and value. Until I click a stage, the second table shows every open deal.',
};

// Held out: no log of these is read to change the builder; they are only scored.
const HOLDOUT: Record<string, string> = {
  holdOwnerDeals: "Pick a deal owner from a dropdown that lists every user; the table shows that owner's open deals with title and value, highest value first. Clicking a deal opens it.",
  holdActivityTabs: "Activities with tabs Calls, Emails, Meetings and Notes; each tab shows that type's activities, newest first, with subject and when.",
  holdTasksDone: 'My tasks with title and due date, ordered by due date, and a checkbox "Show done tasks": unchecked lists my open tasks, checked lists all my tasks.',
  holdCompanyContacts: 'Pick a company from a dropdown that lists every company; the table shows the people who work there, with name, email and title.',
};

type Row = Record<string, unknown>;
// `alt`: another way to know the row when a screen leaves its id out (a title and a date).
// `amount`: the stored value in whole dollars; money a row shows must be near it.
type Candidate = { label: string; alt?: string[]; rank?: number | string; values?: (string | number)[]; amount?: number };
type AnyNode = { type?: string; name?: string; ref?: string; props?: Record<string, unknown>; children?: AnyNode[] };

const sql = async <T extends Record<string, unknown>>(text: string): Promise<T[]> => (await runtime.db.query<T>(text)).rows;
const candidates = async (text: string): Promise<Candidate[]> =>
  (await sql<{ label: string; rank?: number | string; n1?: number; n2?: number; alt1?: string; alt2?: string; amount?: number }>(text)).map((row) => ({
    label: String(row.label),
    ...(row.amount === undefined || row.amount === null ? {} : { amount: Number(row.amount) }),
    ...(row.alt1 === undefined ? {} : { alt: [String(row.alt1), ...(row.alt2 === undefined ? [] : [String(row.alt2)])] }),
    ...(row.rank === undefined || row.rank === null ? {} : { rank: typeof row.rank === 'string' && /^-?\d+(\.\d+)?$/.test(row.rank) ? Number(row.rank) : row.rank }),
    ...(row.n1 === undefined ? {} : { values: [row.n1, ...(row.n2 === undefined ? [] : [row.n2])] }),
  }));

const nodes = (list: AnyNode[]): AnyNode[] => list.flatMap((node) => [node, ...nodes(node.children ?? [])]).filter((node) => node.type === 'component');
const tree = (): AnyNode[] => nodes(shell.flattenRenderTree(shell.getCanvasRenderTree('main')) as AnyNode[]);
const tables = (): AnyNode[] => tree().filter((node) => node.name === 'Table');
const rowsOf = (table: AnyNode | undefined): Row[] => (Array.isArray(table?.props?.['rows']) ? (table?.props?.['rows'] as Row[]) : []);

const at = (row: Row, key: string): unknown => key.split('.').reduce<unknown>((value, part) => (value !== null && typeof value === 'object' ? (value as Row)[part] : undefined), row);

// A column whose key no row holds renders empty.
const blankColumns = (table: AnyNode | undefined): string[] => {
  const rows = rowsOf(table);
  const columns = Array.isArray(table?.props?.['columns']) ? (table?.props?.['columns'] as { label?: string; cell?: { key?: string } }[]) : [];
  if (rows.length === 0) return [];
  return columns.filter((column) => column.cell?.key !== undefined && rows.every((row) => { const value = at(row, column.cell?.key ?? ''); return value === undefined || value === null || value === ''; })).map((column) => String(column.label ?? column.cell?.key));
};

// "$185K" → 185000, "$1.2M" → 1200000, "$2,330.00" → 2330.
const dollars = (text: string): number | undefined => {
  const match = /^\$\s?([\d,]+(?:\.\d+)?)\s?([KkMm]?)$/.exec(text.trim());
  if (match === null) return undefined;
  const scale = match[2]?.toUpperCase() === 'K' ? 1e3 : match[2]?.toUpperCase() === 'M' ? 1e6 : 1;
  return Number((match[1] ?? '').replace(/,/g, '')) * scale;
};

const asText = (value: unknown): string[] => (value === null || value === undefined ? [] : typeof value === 'object' ? Object.values(value as Row).flatMap(asText) : [String(value)]);

// The rows a table shows against the rows the database says it must show: the same rows, the order asked for
// (rows tied on the sort key may come in any order, and a limit may cut through a tie), and any values each row must carry.
const judge = (rendered: Row[], expected: Candidate[], options: { order?: 'asc' | 'desc'; limit?: number } = {}): string => {
  const n = Math.min(options.limit ?? expected.length, expected.length);
  if (rendered.length !== n) return `FAIL ${rendered.length} rows, expected ${n}`;
  const matched: Candidate[] = [];
  for (const row of rendered) {
    const texts = asText(row);
    const byId = expected.find((candidate) => texts.includes(candidate.label));
    const hit = byId ?? expected.find((candidate) => !matched.includes(candidate) && candidate.alt !== undefined && candidate.alt.every((part) => texts.includes(part)));
    if (hit === undefined) return `FAIL a row the database does not answer: ${JSON.stringify(row).slice(0, 120)}`;
    if (matched.includes(hit)) return `FAIL "${hit.label}" shown twice`;
    const shown = texts.map(dollars).filter((value): value is number => value !== undefined);
    if (hit.amount !== undefined && shown.length > 0 && !shown.some((value) => Math.abs(value - (hit.amount ?? 0)) <= Math.max(0.1 * (hit.amount ?? 0), 1))) {
      return `FAIL "${hit.label}" shows ${texts.filter((text) => dollars(text) !== undefined).join(', ')} for ${hit.amount} dollars`;
    }
    const missing = (hit.values ?? []).find((value) => !texts.includes(String(value)));
    if (missing !== undefined) return `FAIL "${hit.label}" lacks ${String(missing)}: ${JSON.stringify(row).slice(0, 120)}`;
    matched.push(hit);
  }
  if (options.limit !== undefined && n > 0) {
    const edge = expected[n - 1]?.rank;
    const better = expected.filter((candidate) => candidate.rank !== undefined && edge !== undefined && (options.order === 'desc' ? candidate.rank > edge : candidate.rank < edge));
    const left = better.find((candidate) => !matched.includes(candidate));
    if (left !== undefined) return `FAIL "${left.label}" belongs in the top ${n} and is missing`;
  }
  if (options.order !== undefined) {
    for (let i = 1; i < matched.length; i++) {
      const before = matched[i - 1]?.rank;
      const now = matched[i]?.rank;
      if (before === undefined || now === undefined) continue;
      if (options.order === 'desc' ? now > before : now < before) return `FAIL out of order at row ${i + 1}: ${String(before)} then ${String(now)}`;
    }
  }
  return `PASS ${n} rows${options.order === undefined ? '' : `, ${options.order}`}`;
};

const settle = (ms = 1800): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// As the DOM does: an input or a select sends a string, a checkbox a boolean.
const typeInto = async (ref: string, value: string | boolean): Promise<void> => {
  shell.dispatch({ type: 'ui:model', ref, payload: value });
  await settle();
};
const click = async (ref: string, payload?: unknown): Promise<void> => {
  shell.dispatch({ type: 'ui:click', ref, ...(payload === undefined ? {} : { payload }) });
  await settle();
};
// A Select names the option fields it reads with valueKey and labelKey.
const optionsOf = (node: AnyNode | undefined): { value: string; label: string }[] => {
  const valueKey = typeof node?.props?.['valueKey'] === 'string' ? node.props['valueKey'] : 'value';
  const labelKey = typeof node?.props?.['labelKey'] === 'string' ? node.props['labelKey'] : 'label';
  return (Array.isArray(node?.props?.['options']) ? (node?.props?.['options'] as Row[]) : []).map((option) => ({ value: String(option[valueKey] ?? ''), label: String(option[labelKey] ?? option[valueKey] ?? '') }));
};

const DEALS_IN = (from: string, to: string): string => `SELECT id AS label, title AS alt1, close_date::text AS alt2, close_date::text AS rank, value::float8 AS amount FROM deals WHERE close_date BETWEEN '${from}' AND '${to}' ORDER BY close_date`;

// Each screen's use, judged against the database. A line per thing done.
const CHECKS: Record<string, () => Promise<string[]>> = {
  top10: async () => [judge(rowsOf(tables()[0]), await candidates("SELECT id AS label, value::float8 AS rank, value::float8 AS amount FROM deals WHERE status = 'open' ORDER BY value DESC"), { order: 'desc', limit: 10 })],
  byMonth: async () => monthChecks(false),
  rayIntent: async () => monthChecks(true),
  search: async () => {
    const found = [`all: ${judge(rowsOf(tables()[0]), await candidates('SELECT id AS label FROM companies'))}`];
    const input = tree().find((node) => node.name === 'Input' && node.ref !== undefined);
    if (input?.ref === undefined) return [...found, 'typing: FAIL no search box with a ref'];
    await typeInto(input.ref, 'an');
    const rendered = rowsOf(tables()[0]);
    const names = await candidates("SELECT id AS label FROM companies WHERE name ILIKE '%an%'");
    const anyField = await candidates("SELECT id AS label FROM companies WHERE name ILIKE '%an%' OR industry ILIKE '%an%' OR domain ILIKE '%an%' OR size ILIKE '%an%'");
    const ids = new Set(rendered.flatMap(asText));
    const lacking = names.filter((name) => !ids.has(name.label));
    const extra = rendered.filter((row) => !asText(row).some((text) => anyField.some((candidate) => candidate.label === text)));
    found.push(`type "an": ${lacking.length === 0 && extra.length === 0 && rendered.length > 0 ? `PASS ${rendered.length} rows, every name match among them` : `FAIL ${rendered.length} rows, ${lacking.length} name matches missing, ${extra.length} rows matching nothing`}`);
    await typeInto(input.ref, '');
    found.push(`clear: ${judge(rowsOf(tables()[0]), await candidates('SELECT id AS label FROM companies'))}`);
    return found;
  },
  overview: async () => [
    judge(
      rowsOf(tables()[0]),
      await candidates("SELECT s.name AS label, sum(d.value)::float8 AS rank, count(*)::int AS n1 FROM deals d JOIN stages s ON s.id = d.stage_id WHERE d.status = 'open' GROUP BY s.name ORDER BY rank DESC"),
      { order: 'desc' },
    ),
  ],
  workspace: async () => {
    const tasks = await candidates(`SELECT id AS label, title AS alt1, due_date::text AS alt2, due_date::text AS rank FROM tasks WHERE done = false AND assignee_id = '${ME}' ORDER BY due_date`);
    const deals = await candidates(`SELECT id AS label, value::float8 AS rank, value::float8 AS amount FROM deals WHERE status = 'open' AND owner_id = '${ME}' ORDER BY value DESC`);
    const share = (table: AnyNode, list: Candidate[]): number => {
      const rows = rowsOf(table);
      return rows.length === 0 ? 0 : rows.filter((row) => asText(row).some((text) => list.some((candidate) => candidate.label === text))).length / rows.length;
    };
    const pick = (list: Candidate[]): AnyNode | undefined => [...tables()].sort((a, b) => share(b, list) - share(a, list))[0];
    return [`tasks: ${judge(rowsOf(pick(tasks)), tasks, { order: 'asc' })}`, `deals: ${judge(rowsOf(pick(deals)), deals, { order: 'desc', limit: 5 })}`];
  },
  feed: async () => [judge(rowsOf(tables()[0]), await candidates('SELECT id AS label, occurred_at::text AS rank FROM activities ORDER BY occurred_at DESC'), { order: 'desc', limit: 30 })],
  wonlost: async () => [
    judge(
      rowsOf(tables()[0]),
      await candidates("SELECT u.name AS label, count(*) FILTER (WHERE d.status = 'won')::int AS rank, count(*) FILTER (WHERE d.status = 'won')::int AS n1, count(*) FILTER (WHERE d.status = 'lost')::int AS n2 FROM deals d JOIN users u ON u.id = d.owner_id WHERE d.status IN ('won', 'lost') GROUP BY u.name ORDER BY rank DESC"),
      { order: 'desc' },
    ),
  ],
  // Relay's today is the UTC date; the database's CURRENT_DATE is its local one, a day ahead late in the evening.
  tasksWeek: async () => [judge(rowsOf(tables()[0]), await candidates(`SELECT id AS label, title AS alt1, due_date::text AS alt2, due_date::text AS rank FROM tasks WHERE done = false AND assignee_id = '${ME}' AND due_date BETWEEN '${todayStr()}'::date AND '${todayStr()}'::date + 7 ORDER BY due_date`), { order: 'asc' })],
  expiry: async () => {
    const inputs = tree().filter((node) => node.name === 'Input' && node.ref !== undefined);
    const [from, to] = inputs;
    if (from?.ref === undefined || to?.ref === undefined) return ['dates: FAIL no two inputs with refs'];
    await typeInto(from.ref, '2026-07-01');
    await typeInto(to.ref, '2026-07-31');
    return [`July: ${judge(rowsOf(tables()[0]), await candidates(DEALS_IN('2026-07-01', '2026-07-31')))}`];
  },
  companyDeals: async () => {
    const select = tree().find((node) => node.name === 'Select' && node.ref !== undefined);
    const options = optionsOf(select);
    if (select?.ref === undefined || options.length < 10) return [`FAIL no company dropdown with a ref (${options.length} options)`];
    const found: string[] = [];
    for (const name of ['Acme Technologies', 'Wayne Industries']) {
      const option = options.find((one) => one.label === name || one.value === name);
      if (option === undefined) {
        found.push(`${name}: FAIL not among the options`);
        continue;
      }
      await typeInto(select.ref, option.value);
      found.push(`${name}: ${judge(rowsOf(tables()[0]), await candidates(`SELECT d.id AS label, d.value::float8 AS amount FROM deals d JOIN companies c ON c.id = d.company_id WHERE c.name = '${name}'`))}`);
    }
    return found;
  },
  stageAndSearch: async () => {
    const select = tree().find((node) => node.name === 'Select' && node.ref !== undefined);
    const input = tree().find((node) => node.name === 'Input' && node.ref !== undefined);
    if (select?.ref === undefined || input?.ref === undefined) return ['FAIL no stage dropdown and search box with refs'];
    const found = [`all: ${judge(rowsOf(tables()[0]), await candidates('SELECT id AS label, value::float8 AS amount FROM deals'))}`];
    const option = optionsOf(select).find((one) => one.label === 'Qualified' || one.value === 'Qualified');
    if (option === undefined) return [...found, 'Qualified: FAIL not among the options'];
    await typeInto(select.ref, option.value);
    found.push(`Qualified: ${judge(rowsOf(tables()[0]), await candidates("SELECT d.id AS label, d.value::float8 AS amount FROM deals d JOIN stages s ON s.id = d.stage_id WHERE s.name = 'Qualified'"))}`);
    await typeInto(input.ref, 'on');
    found.push(`Qualified + "on": ${judge(rowsOf(tables()[0]), await candidates("SELECT d.id AS label, d.value::float8 AS amount FROM deals d JOIN stages s ON s.id = d.stage_id WHERE s.name = 'Qualified' AND d.title ILIKE '%on%'"))}`);
    return found;
  },
  statusTabs: async () => {
    const tabs = tree().find((node) => node.name === 'Tabs' && node.ref !== undefined);
    if (tabs?.ref === undefined) return ['FAIL no Tabs with a ref'];
    const found: string[] = [];
    for (const status of ['Won', 'Lost', 'Open']) {
      const option = optionsOf(tabs).find((one) => one.label === status);
      if (option === undefined) {
        found.push(`${status}: FAIL no such tab`);
        continue;
      }
      await click(tabs.ref, option.value);
      found.push(`${status}: ${judge(rowsOf(tables()[0]), await candidates(`SELECT id AS label, close_date::text AS rank, value::float8 AS amount FROM deals WHERE status = '${status.toLowerCase()}' ORDER BY close_date DESC`), { order: 'desc' })}`);
    }
    return found;
  },
  hideClosed: async () => {
    const box = tree().find((node) => node.name === 'Checkbox' && node.ref !== undefined);
    if (box?.ref === undefined) return [`FAIL no checkbox with a ref (refs: ${tree().filter((node) => node.ref !== undefined).map((node) => `${node.name ?? '?'}:${node.ref ?? ''}`).join(', ')})`];
    const found = [`unchecked: ${judge(rowsOf(tables()[0]), await candidates('SELECT id AS label, value::float8 AS amount FROM deals'))}`];
    await typeInto(box.ref, true);
    found.push(`checked: ${judge(rowsOf(tables()[0]), await candidates("SELECT id AS label, value::float8 AS amount FROM deals WHERE status = 'open'"))}`);
    await typeInto(box.ref, false);
    found.push(`unchecked again: ${judge(rowsOf(tables()[0]), await candidates('SELECT id AS label, value::float8 AS amount FROM deals'))}`);
    return found;
  },
  stageDrill: async () => {
    const open = await candidates("SELECT id AS label, value::float8 AS amount FROM deals WHERE status = 'open'");
    // The render tree is read anew on every call, so the two tables are told apart by position. Deal rows name their
    // stage too: the stage table is the smaller of the clickable ones.
    const before = tables();
    const clickable = before.map((table, at) => ({ table, at })).filter(({ table }) => rowsOf(table).some((row) => asText(row).includes('Qualified')) && typeof table.props?.['rowRef'] === 'string');
    const stages = clickable.sort((a, b) => rowsOf(a.table).length - rowsOf(b.table).length)[0];
    const dealsAt = before.findIndex((_, at) => at !== stages?.at);
    if (stages === undefined || dealsAt < 0) return ['FAIL no clickable stage table beside a deals table'];
    const found = [`before a click: ${judge(rowsOf(before[dealsAt]), open)}`];
    const row = rowsOf(stages.table).find((one) => asText(one).includes('Qualified')) ?? {};
    const key = String(stages.table.props?.['clickKey'] ?? stages.table.props?.['rowKey'] ?? 'id');
    await click(String(stages.table.props?.['rowRef']), row[key]);
    found.push(`Qualified clicked: ${judge(rowsOf(tables()[dealsAt]), await candidates("SELECT d.id AS label, d.value::float8 AS amount FROM deals d JOIN stages s ON s.id = d.stage_id WHERE d.status = 'open' AND s.name = 'Qualified'"))}`);
    return found;
  },
};

const pickFrom = async (label: string, truth: string): Promise<string> => {
  const select = tree().find((node) => node.name === 'Select' && node.ref !== undefined);
  const option = optionsOf(select).find((one) => one.label === label || one.value === label);
  if (select?.ref === undefined || option === undefined) return `${label}: FAIL no dropdown with that option`;
  await typeInto(select.ref, option.value);
  return `${label}: ${judge(rowsOf(tables()[0]), await candidates(truth.replace('$value', option.value)), truth.includes('ORDER BY') ? { order: truth.includes('DESC') ? 'desc' : 'asc' } : {})}`;
};

Object.assign(CHECKS, {
  holdOwnerDeals: async () => [await pickFrom('Jordan Chen', "SELECT d.id AS label, d.value::float8 AS rank, d.value::float8 AS amount FROM deals d JOIN users u ON u.id = d.owner_id WHERE u.name = 'Jordan Chen' AND d.status = 'open' ORDER BY d.value DESC")],
  holdActivityTabs: async () => {
    const tabs = tree().find((node) => node.name === 'Tabs' && node.ref !== undefined);
    if (tabs?.ref === undefined) return ['FAIL no Tabs with a ref'];
    const found: string[] = [];
    for (const [label, type] of [['Emails', 'email'], ['Notes', 'note']] as const) {
      const option = optionsOf(tabs).find((one) => one.label === label);
      if (option === undefined) {
        found.push(`${label}: FAIL no such tab`);
        continue;
      }
      await click(tabs.ref, option.value);
      found.push(`${label}: ${judge(rowsOf(tables()[0]), await candidates(`SELECT id AS label, occurred_at::text AS rank FROM activities WHERE type = '${type}' ORDER BY occurred_at DESC`), { order: 'desc' })}`);
    }
    return found;
  },
  holdTasksDone: async () => {
    const mine = (open: boolean): Promise<Candidate[]> =>
      candidates(`SELECT id AS label, title AS alt1, due_date::text AS alt2, due_date::text AS rank FROM tasks WHERE assignee_id = '${ME}'${open ? ' AND done = false' : ''} ORDER BY due_date`);
    const box = tree().find((node) => node.name === 'Checkbox' && node.ref !== undefined);
    if (box?.ref === undefined) return ['FAIL no checkbox with a ref'];
    const found = [`unchecked: ${judge(rowsOf(tables()[0]), await mine(true), { order: 'asc' })}`];
    await typeInto(box.ref, true);
    found.push(`checked: ${judge(rowsOf(tables()[0]), await mine(false), { order: 'asc' })}`);
    return found;
  },
  holdCompanyContacts: async () => [await pickFrom('Acme Technologies', "SELECT p.id AS label FROM contacts p JOIN companies c ON c.id = p.company_id WHERE c.name = 'Acme Technologies'")],
});

async function monthChecks(ordered: boolean): Promise<string[]> {
  const order = ordered ? { order: 'asc' as const } : {};
  const found = [`June: ${judge(rowsOf(tables()[0]), await candidates(DEALS_IN('2026-06-01', '2026-06-30')), order)}`];
  const select = tree().find((node) => node.name === 'Select' && node.ref !== undefined);
  for (const [month, from, to] of [['July', '2026-07-01', '2026-07-31'], ['August', '2026-08-01', '2026-08-31']] as const) {
    const option = optionsOf(select).find((one) => one.label.includes(month));
    if (select?.ref === undefined || option === undefined) {
      found.push(`${month}: FAIL no month dropdown or option`);
      continue;
    }
    await typeInto(select.ref, option.value);
    found.push(`${month}: ${judge(rowsOf(tables()[0]), await candidates(DEALS_IN(from, to)), order)}`);
  }
  return found;
}

const trunc = (v: unknown, n = 6000): unknown => {
  const s = JSON.stringify(v);
  return s !== undefined && s.length > n ? `${s.slice(0, n)}…[+${s.length - n}]` : v;
};

type RunRow = { intent: string; rep: number; built: boolean; correct: boolean; seconds: number; tools: number; retries: Record<string, number>; note: string };

const main = async (): Promise<void> => {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const group = process.argv.find((a) => a.startsWith('--set='))?.slice(6) ?? 'all';
  const reps = Number(process.argv.find((a) => a.startsWith('--reps='))?.slice(7) ?? '1');
  const model = process.argv.find((a) => a.startsWith('--model='))?.slice(8);
  const effort = process.argv.find((a) => a.startsWith('--effort='))?.slice(9);
  if (model !== undefined || effort !== undefined) {
    const chosen = model ?? 'groq-120b';
    if (!isModelId(chosen) || (effort !== undefined && !isEffort(effort))) {
      console.error(`unknown model "${chosen}" or effort "${effort ?? ''}"`);
      process.exit(2);
    }
    assign('architect', chosen, effort);
  }
  const llm = llmFor('architect');
  if ('error' in llm) {
    console.error(llm.error);
    process.exit(2);
  }
  const intents = group === 'holdout' ? HOLDOUT : { ...(group === 'hard' ? {} : CORE), ...(group === 'core' ? {} : HARD), ...(group === 'all' ? HOLDOUT : {}) };
  const outDir = join(process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? join(tmpdir(), 'relay-architect-suite'), new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });
  console.log(`suite → ${outDir}\n`);

  const setup = screenSetup(devRayContext({ shell, roles: ['sales', 'dev'], runtime }));
  const rows: RunRow[] = [];
  for (const [id, intent] of Object.entries(intents)) {
    if (only !== undefined && !only.includes(id)) continue;
    for (let rep = 1; rep <= reps; rep++) {
      const log = join(outDir, `${id}.${rep}.jsonl`);
      const put = (o: Record<string, unknown>): void => appendFileSync(log, JSON.stringify({ t: Date.now(), ...o }) + '\n');
      put({ ev: 'intent', id, rep, intent });
      const retries: Record<string, number> = {};
      let tools = 0;
      const onEvent = (e: CortexEvent): void => {
        if (e.type === 'tool-start') {
          tools++;
          put({ ev: 'tool-start', path: e.agentPath, tool: e.call.toolId, input: trunc(e.call.args) });
        }
        if (e.type === 'tool-end') {
          const o = e.observation;
          put({ ev: 'tool-end', tool: o.toolId, kind: o.kind, ...(o.kind === 'result' ? { output: trunc(o.result), ms: o.durationMs } : {}), ...(o.kind === 'error' ? { error: trunc(o.error), ms: o.durationMs } : {}) });
        }
        if (e.type === 'retry') {
          retries[e.kind] = (retries[e.kind] ?? 0) + 1;
          put({ ev: 'retry', kind: e.kind, attempt: e.attempt, issues: e.issues });
        }
        if (e.type === 'run-end') put({ ev: 'run-end', path: e.agentPath, ...(e.result.ok ? { ok: true } : { ok: false, error: e.result.error.message }), steps: e.meta.steps, usage: e.meta.usage });
      };

      const t0 = Date.now();
      const built = await buildScreen(intent, setup, { llm: llm.llm, onEvent });
      const seconds = Math.round((Date.now() - t0) / 100) / 10;

      let note: string;
      let correct = false;
      if (built.ok) {
        put({ ev: 'built', action: built.action, probes: built.probes });
        writeFileSync(join(outDir, `${id}.${rep}.action.json`), JSON.stringify({ action: built.action, probes: built.probes }, null, 2));
        shell.registerAction(built.action);
        const instance = shell.push('main', built.action.id);
        const rt = shell.getRuntime(instance);
        if (rt === undefined) note = 'no runtime after push';
        else {
          await new Promise<void>((resolve) => {
            if (rt.instance.status === 'active') return resolve();
            const off = rt.onStatusChange((status: string) => {
              if (status === 'active' || status === 'unmounted') {
                off();
                resolve();
              }
            });
            setTimeout(resolve, 20000);
          });
          await settle(2000);
          const blank = tables().flatMap(blankColumns);
          const results = await (CHECKS[id]?.() ?? Promise.resolve(['no check']));
          correct = results.every((line) => line.includes('PASS')) && blank.length === 0;
          note = [...results, ...(blank.length > 0 ? [`blank columns: ${blank.join(', ')}`] : [])].join('; ');
          put({ ev: 'checks', results, blank });
        }
        shell.removeAction(built.action.id);
      } else {
        note = built.error.slice(0, 160);
        put({ ev: 'failed', error: built.error, findings: built.findings, candidate: built.candidate === undefined ? null : trunc(built.candidate, 12000) });
      }
      rows.push({ intent: id, rep, built: built.ok, correct, seconds, tools, retries, note });
      console.log(`${id}#${rep}  ${built.ok ? (correct ? 'RIGHT' : 'WRONG') : 'FAIL '} ${String(seconds).padStart(5)}s  tools:${tools}  retries:${JSON.stringify(retries)}  — ${note}`);
    }
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(rows, null, 2));
  console.log(`\n${rows.filter((r) => r.built).length}/${rows.length} built, ${rows.filter((r) => r.correct).length}/${rows.length} right. Logs: ${outDir}`);
  process.exit(0);
};

void main();
