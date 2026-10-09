// Holds every library to every task's answer, before anything is timed.
//
//   node harness/check.mjs                  every adapter in libs/
//   node harness/check.mjs jsonata mingo    these adapters
//   node harness/check.mjs --json           the matrix as JSON on stdout (what report.mjs reads)
//
// For each task a library says it can express, on every check input (tasks.mjs, checkInputs):
//   - run(prepare(source), input), run again on the same prepared form, and oneShot(source, input) must each equal
//     reference(input) after one JSON round trip: same keys, same values, key order aside;
//   - the input must be as it was. It is handed over deep-frozen.
// Exit code 1 if any library fails a task it claims.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TASKS, checkInputs } from '../tasks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const wanted = args.filter((a) => !a.startsWith('--'));

export const adapterIds = () =>
  readdirSync(join(root, 'libs'))
    .filter((name) => name.endsWith('.mjs') && !name.includes('.shared.'))
    .map((name) => name.slice(0, -4))
    .sort();

export const loadAdapter = async (id) => {
  const adapter = (await import(pathToFileURL(join(root, 'libs', `${id}.mjs`)).href)).default;
  if (adapter?.id !== id) throw new Error(`libs/${id}.mjs must default-export an adapter whose id is "${id}"`);
  return adapter;
};

// What a task of an adapter runs with: its own functions, or the adapter's.
export const entryOf = (adapter, taskId) => {
  const entry = adapter.tasks?.[taskId];
  if (entry === undefined) return { missing: true };
  if (entry.notExpressible !== undefined) return { notExpressible: entry.notExpressible };
  const prepare = entry.prepare ?? adapter.prepare;
  const run = entry.run ?? adapter.run;
  const oneShot = entry.oneShot ?? adapter.oneShot;
  if (typeof prepare !== 'function' || typeof run !== 'function' || typeof oneShot !== 'function') {
    throw new Error(`${adapter.id}/${taskId}: prepare, run and oneShot must each be given, on the task or on the adapter`);
  }
  return { source: entry.source, prepare, run, oneShot, glue: entry.glue };
};

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
};

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const textOf = (value) => {
  if (value === undefined) return 'undefined';
  return JSON.stringify(canonical(JSON.parse(JSON.stringify(value))));
};

const checkTask = async (adapter, task) => {
  const entry = entryOf(adapter, task.id);
  if (entry.missing) return { state: 'missing' };
  if (entry.notExpressible !== undefined) return { state: 'not expressible', why: entry.notExpressible };
  const inputs = checkInputs(task);
  for (const [index, made] of inputs.entries()) {
    const want = textOf(task.reference(made));
    const before = JSON.stringify(made);
    const input = deepFreeze(structuredClone(made));
    const ways = [];
    try {
      const prepared = await entry.prepare(structuredClone(entry.source));
      ways.push(['run', await entry.run(prepared, input)], ['run again', await entry.run(prepared, input)]);
      ways.push(['oneShot', await entry.oneShot(structuredClone(entry.source), input)]);
    } catch (error) {
      return { state: 'fails', why: `input ${index}: threw ${error?.constructor?.name}: ${String(error?.message).slice(0, 300)}` };
    }
    for (const [way, got] of ways) {
      let gotText;
      try {
        gotText = textOf(got);
      } catch (error) {
        return { state: 'fails', why: `input ${index}, ${way}: the answer is not JSON (${String(error?.message).slice(0, 120)})` };
      }
      if (gotText !== want) return { state: 'fails', why: `input ${index}, ${way}: got ${gotText.slice(0, 400)} — wanted ${want.slice(0, 400)}` };
    }
    if (JSON.stringify(input) !== before) return { state: 'fails', why: `input ${index}: the input was changed` };
  }
  return { state: 'ok', inputs: inputs.length, glue: entry.glue };
};

const main = async () => {
  const ids = wanted.length > 0 ? wanted : adapterIds();
  const matrix = {};
  let failed = false;
  for (const id of ids) {
    const adapter = await loadAdapter(id);
    matrix[id] = {};
    for (const task of TASKS) {
      const result = await checkTask(adapter, task);
      matrix[id][task.id] = result;
      if (result.state === 'fails' || result.state === 'missing') failed = true;
    }
  }
  if (asJson) {
    console.log(JSON.stringify(matrix, null, 2));
  } else {
    const mark = { ok: 'ok', 'not expressible': '—', fails: 'FAILS', missing: 'MISSING' };
    console.log(['library'.padEnd(26), ...TASKS.map((t) => t.id.padEnd(11))].join(' '));
    for (const id of ids) console.log([id.padEnd(26), ...TASKS.map((t) => mark[matrix[id][t.id].state].padEnd(11))].join(' '));
    for (const id of ids) {
      for (const task of TASKS) {
        const result = matrix[id][task.id];
        if (result.state === 'fails') console.log(`\nFAILS ${id}/${task.id}: ${result.why}`);
        if (result.state === 'missing') console.log(`\nMISSING ${id}/${task.id}: give it a source, or { notExpressible: 'why' }`);
        if (result.state === 'not expressible') console.log(`— ${id}/${task.id}: ${result.why}`);
      }
    }
  }
  process.exitCode = failed ? 1 : 0;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
