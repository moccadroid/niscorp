import { deflateSync } from 'node:zlib';
import type { Shell } from '@niscorp/nova';
import { CAST } from '@lyra/db/seed';
import { idFor, mintToken, runtime, server, settle } from './world';

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

const treeOfCanvas = (shell: Shell, canvas: string): unknown => shell.flattenRenderTree(shell.getCanvasRenderTree(canvas));
const bytes = (v: unknown): number => JSON.stringify(v)?.length ?? 0;
const squashed = (v: unknown): number => deflateSync(Buffer.from(JSON.stringify(v) ?? '')).length;

const diff = (a: unknown, b: unknown, path: string, out: [string, unknown][]): void => {
  if (a === b) return;
  const bothObjects = a !== null && b !== null && typeof a === 'object' && typeof b === 'object';
  if (!bothObjects) {
    out.push([path, b]);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && Array.isArray(b) && a.length !== b.length)) {
    out.push([path, b]);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    diff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}/${key}`, out);
  }
};

const patchBytes = (a: unknown, b: unknown): number => {
  const ops: [string, unknown][] = [];
  diff(a, b, '', ops);
  return bytes(ops);
};

const owner = await server.shells?.session(await mintToken(CAST.lumen.owner), idFor(CAST.lumen.owner));
await settle(20);
if (owner === undefined) throw new Error('bench: no shell');
const shell = owner.shell;

// Approximates a byte-delta: deflating the new frame with the old one as zlib's
// preset dictionary is close to what fossil-delta or xdelta would emit.
const deltaBytes = (before: unknown, after: unknown): number => {
  const dictionary = Buffer.from(JSON.stringify(before) ?? '');
  return deflateSync(Buffer.from(JSON.stringify(after) ?? ''), { dictionary }).length;
};

const report = (label: string, before: unknown, after: unknown): void => {
  const full = bytes(after);
  const gz = squashed(after);
  const patch = patchBytes(before, after);
  const delta = deltaBytes(before, after);
  const pct = (n: number): string => `${((n / full) * 100).toFixed(0)}%`;
  console.log(
    `  ${label.padEnd(28)} ${String(full).padStart(6)} ${String(gz).padStart(8)} ${pct(gz).padStart(5)} ${String(patch).padStart(8)} ${pct(patch).padStart(5)} ${String(delta).padStart(8)} ${pct(delta).padStart(5)}`,
  );
};

console.log(`\n${bold('WIRE BENCH')} ${dim('— bytes moss sends today, vs compressed, vs diffed')}`);
console.log(dim('  scenario                       full  deflate         patch        delta'));

shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(20);
let before = treeOfCanvas(shell, 'main');
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'plans.list' });
await settle(20);
report('navigate: people → plans', before, treeOfCanvas(shell, 'main'));

shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(20);
before = treeOfCanvas(shell, 'main');
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'reports.overview' });
await settle(20);
report('navigate: people → reports', before, treeOfCanvas(shell, 'main'));

shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(24);
for (const typed of ['a', 'av', 'ava']) {
  const was = treeOfCanvas(shell, 'main');
  shell.dispatch({ type: 'ui:model', ref: 'search', payload: typed });
  await settle(24);
  report(`search keystroke → "${typed}"`, was, treeOfCanvas(shell, 'main'));
}

shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(24);
shell.dispatch({ type: 'ui:model', ref: 'search', payload: '' });
await settle(24);
const wasRoll = treeOfCanvas(shell, 'main');
shell.dispatch({ type: 'ui:click', ref: 'scope', payload: { value: 'everyone', label: 'Everyone', statuses: ['active', 'paused', 'cancelled'] } });
await settle(24);
const nowRoll = treeOfCanvas(shell, 'main');
report('filter: current → everyone', wasRoll, nowRoll);
if (bytes(wasRoll) === bytes(nowRoll)) console.log(dim('    (identical — the dispatch did nothing; ignore this row)'));

console.log(dim('\n  patch = [path, value] pairs for every leaf that moved; no keying,'));
console.log(dim('  so a list reorder costs the whole list — the case a real differ must key.'));
console.log('');
process.exit(0);
