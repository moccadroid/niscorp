// The timed runs. Every case is a process of its own (harness/case.mjs), one after another, in a shuffled order.
//
//   node harness/run.mjs                       every adapter that passes the check
//   node harness/run.mjs --only prism,jsonata  these adapters
//   node harness/run.mjs --passes 2            the whole list this many times, shuffled anew each time (default 1)
//   node harness/run.mjs --node <path>         run the cases with another node binary
//   node harness/run.mjs --label quick         results/<label>.raw.json instead of results/node-<major>.raw.json
//
// Nothing else should be running on the machine. A library is only timed on the tasks it passed in the check.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASKS } from '../tasks.mjs';
import { adapterIds, loadAdapter } from './check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const only = option('--only', '').split(',').filter(Boolean);
const passes = Number(option('--passes', '1'));
const node = option('--node', process.execPath);
const COLD_RUNS = 7;

const nodeVersion = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim();
const label = option('--label', `node-${nodeVersion.replace(/^v/, '').split('.')[0]}`);

// The check, run with the node that will run the cases: what it says is ok is what is timed.
const ids = only.length > 0 ? only : adapterIds();
const checked = spawnSync(node, [join(root, 'harness', 'check.mjs'), ...ids, '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
const matrix = JSON.parse(checked.stdout);
const failing = Object.entries(matrix).flatMap(([id, tasks]) => Object.entries(tasks).filter(([, r]) => r.state === 'fails' || r.state === 'missing').map(([task, r]) => `${id}/${task}: ${r.why ?? r.state}`));
if (failing.length > 0) console.log(`Not timed, because the check fails:\n  ${failing.join('\n  ')}`);

const versionOf = (name) => {
  if (name === null) return null;
  if (name === '@niscorp/prism') return null;
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
};

const libraries = {};
const cases = [];
for (const id of ids) {
  const adapter = await loadAdapter(id);
  libraries[id] = { name: adapter.name, package: adapter.package, version: versionOf(adapter.package), transform: adapter.transform, usesEval: adapter.usesEval === true, prepared: adapter.prepared !== false, notes: adapter.notes ?? '' };
  let any = false;
  for (const task of TASKS) {
    if (matrix[id][task.id].state !== 'ok') continue;
    any = true;
    // A row whose prepare only hands its source back (the same object kept) has no prepare to time.
    if (adapter.prepared !== false && adapter.prepareTimed !== false) cases.push([id, task.id, task.sizes[0], 'prepare']);
    for (const size of task.sizes) {
      if (adapter.prepared !== false) cases.push([id, task.id, size, 'run']);
      cases.push([id, task.id, size, 'oneshot']);
    }
  }
  if (!any) continue;
  cases.push([id, '-', 0, 'rotate']);
  for (let n = 0; n < COLD_RUNS; n += 1) cases.push([id, '-', 0, 'cold']);
}

// A seeded shuffle, so a run can be repeated in the same order.
const shuffled = (list, seed) => {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

mkdirSync(join(root, 'results'), { recursive: true });
const file = join(root, 'results', `${label}.raw.json`);
const out = {
  environment: { node: nodeVersion, v8: execFileSync(node, ['-p', 'process.versions.v8'], { encoding: 'utf8' }).trim(), cpu: os.cpus()[0].model.trim(), cores: os.cpus().length, memoryGb: Math.round(os.totalmem() / 2 ** 30), os: `${os.type()} ${os.release()} ${os.arch()}`, started: new Date().toISOString(), passes },
  libraries,
  check: matrix,
  results: [],
};

const total = cases.length * passes;
let done = 0;
const began = Date.now();
for (let pass = 0; pass < passes; pass += 1) {
  for (const [id, task, size, phase] of shuffled(cases, 20261008 + pass)) {
    const from = Date.now();
    const ran = spawnSync(node, ['--expose-gc', join(root, 'harness', 'case.mjs'), id, task, String(size), phase], { cwd: root, encoding: 'utf8', timeout: 90_000, maxBuffer: 1 << 24 });
    const line = (ran.stdout ?? '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
    let result;
    try {
      result = JSON.parse(line);
    } catch {
      result = { library: id, task, size, phase, error: ran.error ? String(ran.error.message) : `no result (exit ${ran.status}): ${(ran.stderr ?? '').slice(0, 200)}` };
    }
    out.results.push({ pass, tookMs: Date.now() - from, ...result });
    done += 1;
    if (done % 25 === 0 || done === total) {
      out.environment.finished = new Date().toISOString();
      writeFileSync(file, JSON.stringify(out));
      const eta = ((Date.now() - began) / done) * (total - done);
      console.log(`${done}/${total}  ${Math.round(eta / 60000)} min left`);
    }
  }
}
out.environment.finished = new Date().toISOString();
writeFileSync(file, JSON.stringify(out));
console.log(`Wrote ${file}`);
