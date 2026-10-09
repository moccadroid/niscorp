// One case, in a process of its own: one library, one task, one size, one of the things that are timed.
//
//   node --expose-gc harness/case.mjs <library> <task> <size> <phase>
//
// phase:
//   prepare   the stored form parsed or compiled, from a fresh copy each call
//   run       what prepare made, over the input
//   oneshot   stored form to answer, from a fresh copy each call
//   rotate    every one-order task the library can do, prepared once, called in turn (task and size are ignored)
//   cold      import the library and answer `project` once (task and size are ignored)
//
// Prints one line of JSON. Times are nanoseconds for one call.

import { performance } from 'node:perf_hooks';
import { TASKS, taskOf } from '../tasks.mjs';
import { entryOf, loadAdapter } from './check.mjs';

const [libraryId, taskId, sizeText, phase] = process.argv.slice(2);
const started = performance.now();

const WARM_MS = 300;
const MEASURE_MS = 800;
const BATCH_MS = 4;
const MIN_SAMPLES = 25;
const MAX_MS = 6000;

// Every answer is put here, so that a call whose answer nobody reads is not optimized away.
let kept;
export const lastAnswer = () => kept;

const isThenable = (value) => value !== null && typeof value === 'object' && typeof value.then === 'function';

// `make(count)` hands back the arguments of `count` calls, made outside the clock; `call(argument)` is what is timed.
// `fresh` says the arguments are new objects for each call: the ones of the batch before are collected before the
// clock starts, so that their collection is not charged to the batch after.
const measure = async (make, call, fresh = false) => {
  const first = call(make(1)[0]);
  const waits = isThenable(first);
  if (waits) await first;
  const batch = async (args) => {
    const from = performance.now();
    if (waits) for (let i = 0; i < args.length; i += 1) kept = await call(args[i]);
    else for (let i = 0; i < args.length; i += 1) kept = call(args[i]);
    return performance.now() - from;
  };
  // Warm up, and find how many calls fill a batch.
  let calls = 0;
  let spent = 0;
  let size = 1;
  while (spent < WARM_MS || calls < 3) {
    const took = await batch(make(size));
    spent += took;
    calls += size;
    if (took < BATCH_MS / 2 && size < (fresh ? 4096 : 1 << 20)) size *= 2;
    if (spent > MAX_MS) break;
  }
  const perCall = spent / calls;
  // Fresh arguments are made a batch at a time and held until it has run: no more than 4096 of them.
  const batchSize = Math.max(1, Math.min(fresh ? 4096 : 1 << 20, Math.round(BATCH_MS / Math.max(perCall, 1e-6))));
  globalThis.gc?.();
  const samples = [];
  let measured = 0;
  while ((measured < MEASURE_MS || samples.length < MIN_SAMPLES) && measured < MAX_MS) {
    const args = make(batchSize);
    if (fresh) globalThis.gc?.();
    const took = await batch(args);
    measured += took;
    samples.push((took / batchSize) * 1e6);
    if (samples.length >= 5 && measured >= MAX_MS / 2 && perCall > 50) break;
  }
  samples.sort((a, b) => a - b);
  const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  return { waits, batchSize, samples: samples.length, min: samples[0], p25: at(0.25), median: at(0.5), p75: at(0.75), max: samples[samples.length - 1], mean: samples.reduce((a, b) => a + b, 0) / samples.length };
};

const same = (value) => (count) => new Array(count).fill(value);
const copies = (source) => (count) => {
  const out = new Array(count);
  for (let i = 0; i < count; i += 1) out[i] = typeof source === 'string' ? source : structuredClone(source);
  return out;
};

const main = async () => {
  if (phase === 'cold') {
    const adapter = await loadAdapter(libraryId);
    const imported = performance.now();
    const task = taskOf('project');
    const entry = entryOf(adapter, 'project');
    if (entry.source === undefined) return { skipped: 'cannot express project' };
    const input = task.input(1, 1);
    await entry.oneShot(structuredClone(entry.source), input);
    const answered = performance.now();
    return { importMs: imported - started, firstCallMs: answered - imported };
  }
  const adapter = await loadAdapter(libraryId);
  if (phase === 'rotate') {
    const prepared = [];
    for (const task of TASKS.filter((t) => t.kind === 'record')) {
      const entry = entryOf(adapter, task.id);
      if (entry.source === undefined) continue;
      prepared.push({ run: entry.run, form: await entry.prepare(structuredClone(entry.source)), input: task.input(1, 1), id: task.id });
    }
    if (prepared.length === 0) return { skipped: 'no one-order task' };
    let turn = 0;
    const stats = await measure(same(null), () => {
      const next = prepared[(turn += 1) % prepared.length];
      return next.run(next.form, next.input);
    });
    return { ...stats, tasks: prepared.map((p) => p.id) };
  }
  const task = taskOf(taskId);
  const entry = entryOf(adapter, taskId);
  if (entry.source === undefined) return { skipped: 'not expressible' };
  const input = task.input(Number(sizeText), 1);
  if (phase === 'prepare') return measure(copies(entry.source), (source) => entry.prepare(source), typeof entry.source !== 'string');
  if (phase === 'run') {
    const form = await entry.prepare(structuredClone(entry.source));
    return measure(same(form), (prepared) => entry.run(prepared, input));
  }
  if (phase === 'oneshot') return measure(copies(entry.source), (source) => entry.oneShot(source, input), typeof entry.source !== 'string');
  throw new Error(`No phase "${phase}"`);
};

try {
  console.log(JSON.stringify({ library: libraryId, task: taskId, size: Number(sizeText), phase, ...(await main()) }));
} catch (error) {
  console.log(JSON.stringify({ library: libraryId, task: taskId, size: Number(sizeText), phase, error: `${error?.constructor?.name}: ${String(error?.message).slice(0, 300)}` }));
}
// A library that keeps a worker or a timer alive must not hold the run.
process.exit(0);
