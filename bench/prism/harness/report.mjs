// results/*.raw.json as tables: results/REPORT-<label>.md for each run, and results/SOURCES.md, every task as
// every library writes it.
//
//   node harness/report.mjs            every run in results/
//   node harness/report.mjs node-24    that run

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASKS } from '../tasks.mjs';
import { entryOf, loadAdapter } from './check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'results');
const wanted = process.argv.slice(2);
const labels = (wanted.length > 0 ? wanted : readdirSync(dir).filter((f) => f.endsWith('.raw.json')).map((f) => f.slice(0, -9))).sort();

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length === 0 ? undefined : sorted[Math.floor((sorted.length - 1) / 2)];
};
const geomean = (list) => (list.length === 0 ? undefined : Math.exp(list.reduce((sum, x) => sum + Math.log(x), 0) / list.length));

// A time in the unit a reader takes in at a glance.
const time = (ns) => {
  if (ns === undefined) return '';
  if (ns < 1000) return `${ns < 10 ? ns.toFixed(1) : Math.round(ns)} ns`;
  if (ns < 1e6) return `${(ns / 1000).toFixed(ns < 1e4 ? 2 : ns < 1e5 ? 1 : 0)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(ns < 1e7 ? 2 : ns < 1e8 ? 1 : 0)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
};
const times = (x) => (x === undefined ? '' : x >= 100 ? `${Math.round(x)}×` : x >= 10 ? `${x.toFixed(1)}×` : `${x.toFixed(2)}×`);
// Words to the left, figures to the right.
const WORDS = new Set(['library', 'package', 'version', 'the transform is', 'prepared form', 'notes', 'note']);
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map((h) => (WORDS.has(h) ? '---' : '---:')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const reportOf = (label) => {
  const raw = JSON.parse(readFileSync(join(dir, `${label}.raw.json`), 'utf8'));
  const { environment: env, libraries, check } = raw;
  const ids = Object.keys(libraries);
  const name = (id) => libraries[id].name + (libraries[id].usesEval ? ' ⚠ eval' : '');

  // One number for a case: the median over passes of each process's median.
  const cell = new Map();
  const errors = [];
  for (const r of raw.results) {
    if (r.error !== undefined) errors.push(`${r.library} ${r.task} ${r.size} ${r.phase}: ${r.error}`);
    if (r.median === undefined && r.importMs === undefined) continue;
    const key = `${r.library}|${r.task}|${r.size}|${r.phase}`;
    if (!cell.has(key)) cell.set(key, []);
    cell.get(key).push(r);
  }
  const at = (id, task, size, phase) => median((cell.get(`${id}|${task}|${size}|${phase}`) ?? []).map((r) => r.median));
  // What a host that keeps what it can keep pays for each call: the prepared form where the library has one.
  const repeated = (id, task, size) => (libraries[id].prepared ? at(id, task, size, 'run') : at(id, task, size, 'oneshot'));
  const expresses = (id, task) => check[id]?.[task]?.state === 'ok';

  const lines = [];
  const say = (...text) => lines.push(...text, '');

  say(`# Prism against the libraries it is compared with — ${label}`);
  say(`Run ${env.started.slice(0, 10)} on ${env.cpu} (${env.cores} threads, ${env.memoryGb} GB), ${env.os}, Node ${env.node} (V8 ${env.v8}). ${env.passes} pass${env.passes === 1 ? '' : 'es'}; every case in a process of its own; each figure is the median over passes of that process's median for one call.`);
  say('Read `README.md` for the tasks and the rules, and `results/SOURCES.md` for each task as each library writes it.');

  say('## The libraries');
  say(table(['library', 'package', 'version', 'the transform is', 'prepared form', 'notes'], ids.map((id) => [name(id), libraries[id].package ?? '', libraries[id].version ?? '', libraries[id].transform, libraries[id].prepared ? 'yes' : 'no', libraries[id].notes])));

  say('## What each can express');
  say('`ok`: the library gives the task\'s answer on every check input. `—`: it cannot express the task without custom code.');
  say(table(['library', ...TASKS.map((t) => t.id), 'of 11'], ids.map((id) => [name(id), ...TASKS.map((t) => (expresses(id, t.id) ? 'ok' : check[id]?.[t.id]?.state === 'not expressible' ? '—' : 'FAILS')), String(TASKS.filter((t) => expresses(id, t.id)).length)])));
  const whys = ids.flatMap((id) => TASKS.filter((t) => check[id]?.[t.id]?.state === 'not expressible').map((t) => `- **${libraries[id].name}**, \`${t.id}\`: ${check[id][t.id].why}`));
  if (whys.length > 0) say('Why not:', whys.join('\n'));

  say('## Against Prism, over everything');
  say('How long a call takes next to Prism\'s `execute`, as a geometric mean over the tasks both express: `2.00×` is twice as long as Prism, `0.50×` is half. "Repeated call" is the prepared form where a library has one, its one-shot call where it has none. One-order tasks and 10,000-order tasks are apart, because fixed cost rules the first and per-row cost the second.');
  const against = (id, tasks, size, pick) => geomean(tasks.filter((t) => expresses(id, t.id) && pick(id, t.id, size(t)) !== undefined && pick('prism', t.id, size(t)) !== undefined).map((t) => pick(id, t.id, size(t)) / pick('prism', t.id, size(t))));
  const records = TASKS.filter((t) => t.kind === 'record');
  const collections = TASKS.filter((t) => t.kind === 'collection');
  if (ids.includes('prism')) {
    const rows = ids.map((id) => ({ id, one: against(id, records, () => 1, repeated), small: against(id, collections, () => 100, repeated), big: against(id, collections, () => 10000, repeated), shot: against(id, records, () => 1, (i, t, s) => at(i, t, s, 'oneshot')) }));
    rows.sort((a, b) => (a.one ?? Infinity) - (b.one ?? Infinity));
    say(table(['library', 'tasks', 'repeated call, one order', 'repeated call, 100 orders', 'repeated call, 10,000 orders', 'one shot, one order'], rows.map((r) => [name(r.id), `${TASKS.filter((t) => expresses(r.id, t.id)).length}`, times(r.one), times(r.small), times(r.big), times(r.shot)])));
  }

  say('## One order');
  for (const task of records) {
    say(`### \`${task.id}\` — ${task.title}`, task.words);
    const rows = ids.filter((id) => expresses(id, task.id)).map((id) => ({ id, prepare: at(id, task.id, 1, 'prepare'), run: at(id, task.id, 1, 'run'), shot: at(id, task.id, 1, 'oneshot'), rep: repeated(id, task.id, 1) }));
    rows.sort((a, b) => (a.rep ?? Infinity) - (b.rep ?? Infinity));
    const out = ids.filter((id) => !expresses(id, task.id)).map((id) => libraries[id].name);
    say(table(['library', 'prepare', 'run prepared', 'one shot'], rows.map((r) => [name(r.id), time(r.prepare), time(r.run), time(r.shot)])));
    if (out.length > 0) say(`Not expressible: ${out.join(', ')}.`);
  }

  say('## Many orders');
  for (const task of collections) {
    say(`### \`${task.id}\` — ${task.title}`, task.words);
    const rows = ids.filter((id) => expresses(id, task.id)).map((id) => ({ id, small: repeated(id, task.id, 100), big: repeated(id, task.id, 10000), shotSmall: at(id, task.id, 100, 'oneshot'), shotBig: at(id, task.id, 10000, 'oneshot'), prepare: at(id, task.id, 100, 'prepare') }));
    rows.sort((a, b) => (a.big ?? Infinity) - (b.big ?? Infinity));
    const out = ids.filter((id) => !expresses(id, task.id)).map((id) => libraries[id].name);
    say(table(['library', 'prepare', 'repeated call, 100', 'repeated call, 10,000', 'one shot, 100', 'one shot, 10,000'], rows.map((r) => [name(r.id), time(r.prepare), time(r.small), time(r.big), time(r.shotSmall), time(r.shotBig)])));
    if (out.length > 0) say(`Not expressible: ${out.join(', ')}.`);
  }

  say('## Start, and many configs in turn');
  say('"Import" is loading the library in a new process; "first call" is `project` answered once after that. "In turn" is every one-order task the library can do, prepared once and called one after another, next to the mean of the same tasks each timed alone: above `1×` is what a process running many transforms pays over one running a single transform.');
  const coldRows = ids.map((id) => {
    const cold = cell.get(`${id}|-|0|cold`) ?? [];
    const rotate = median((cell.get(`${id}|-|0|rotate`) ?? []).map((r) => r.median));
    const tasks = (cell.get(`${id}|-|0|rotate`) ?? [])[0]?.tasks ?? [];
    const alone = tasks.map((t) => repeated(id, t, 1)).filter((x) => x !== undefined);
    const mean = alone.length === tasks.length && alone.length > 0 ? alone.reduce((a, b) => a + b, 0) / alone.length : undefined;
    return [name(id), cold.length > 0 ? `${median(cold.map((r) => r.importMs)).toFixed(1)} ms` : '', cold.length > 0 ? time(median(cold.map((r) => r.firstCallMs)) * 1e6) : '', time(rotate), mean === undefined || rotate === undefined ? '' : times(rotate / mean)];
  });
  say(table(['library', 'import', 'first call', 'in turn, one call', 'against each alone'], coldRows));

  const sizesFile = join(dir, 'sizes.json');
  if (existsSync(sizesFile)) {
    const sizes = JSON.parse(readFileSync(sizesFile, 'utf8'));
    say('## What each adds to a bundle');
    say('One entry that imports what the adapter uses, bundled and minified by esbuild for the browser, with everything it depends on.');
    say(table(['library', 'minified', 'gzip', 'note'], sizes.map((s) => [s.name, `${(s.minified / 1024).toFixed(1)} kB`, `${(s.gzip / 1024).toFixed(1)} kB`, s.note ?? ''])));
  }

  if (errors.length > 0) say('## Cases that gave no time', errors.map((e) => `- ${e}`).join('\n'));
  writeFileSync(join(dir, `REPORT-${label}.md`), lines.join('\n'));
  console.log(`Wrote results/REPORT-${label}.md (${raw.results.length} cases, ${errors.length} without a time)`);
  return ids;
};

let ids = [];
for (const label of labels) ids = reportOf(label);

// Every task as every library writes it.
const text = ['# Every task, as every library writes it', '', 'What `libs/<id>.mjs` holds as `source`: the form an author writes and a host stores.', ''];
for (const task of TASKS) {
  text.push(`## \`${task.id}\` — ${task.title}`, '', task.words, '');
  for (const id of ids) {
    const adapter = await loadAdapter(id);
    const entry = entryOf(adapter, task.id);
    if (id.startsWith('prism-')) continue;
    if (entry.notExpressible !== undefined) text.push(`**${adapter.name}** — not expressible: ${entry.notExpressible}`, '');
    else if (entry.source !== undefined) text.push(`**${adapter.name}**${entry.glue ? ` (glue: ${entry.glue})` : ''}`, '', '```' + (typeof entry.source === 'string' ? '' : 'json'), typeof entry.source === 'string' ? entry.source : JSON.stringify(entry.source, null, 2), '```', '');
  }
}
writeFileSync(join(dir, 'SOURCES.md'), text.join('\n'));
console.log('Wrote results/SOURCES.md');
