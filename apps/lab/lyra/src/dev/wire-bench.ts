// Wire bench — what diffing would buy, measured against doing nothing.
//
// Moss sends a whole canvas tree whenever that tree changes. Two cheaper things
// are possible: compress the frame, or send only what moved. This measures both
// against the real trees Lyra produces, for the two change shapes that matter —
// a NAVIGATION (the tree is genuinely different) and an IN-PLACE update (a
// keystroke in a search box, where the tree is almost entirely the same).
//
// Run: pnpm --filter lyra exec tsx src/dev/wire-bench.ts
import { deflateSync } from 'node:zlib';
import type { Shell } from '@niscorp/nova';
import { mintToken, personByEmail } from '@lyra/server/users';
import { CAST } from '@lyra/db/seed';
import { server, settle } from './world';

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

const treeOfCanvas = (shell: Shell, canvas: string): unknown => shell.flattenRenderTree(shell.getCanvasRenderTree(canvas));
const bytes = (v: unknown): number => JSON.stringify(v)?.length ?? 0;
const squashed = (v: unknown): number => deflateSync(Buffer.from(JSON.stringify(v) ?? '')).length;

// A representative structural diff: walk both trees together and emit
// [path, value] for every leaf that moved. No keying, so a list REORDER costs
// the whole list — which is honest, because that is the case a naive diff
// handles worst and the one a real implementation has to key to survive.
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

const owner = server.shells?.session(mintToken(CAST.lumen.owner), personByEmail(CAST.lumen.owner)?.id ?? null);
await settle(20);
if (owner === undefined) throw new Error('bench: no shell');
const shell = owner.shell;

// A byte-delta against the previous frame, approximated with zlib's preset
// DICTIONARY: compressing the new frame with the old one as the dictionary is
// close to what fossil-delta or xdelta would emit, and needs no dependency.
// This is the number that decides whether a delta layer beats the deflate moss
// already has — because `permessage-deflate` with context takeover is itself a
// crude version of the same idea.
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

// ── navigation: the tree really is different ─────────────────
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

// ── in-place: a keystroke in the search box ──────────────────
//
// The frequent case, and the one diffing exists for. Each keystroke re-runs the
// read and re-sends the WHOLE roll today.
shell.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(24);
for (const typed of ['a', 'av', 'ava']) {
  const was = treeOfCanvas(shell, 'main');
  shell.dispatch({ type: 'ui:model', ref: 'search', payload: typed });
  await settle(24);
  report(`search keystroke → "${typed}"`, was, treeOfCanvas(shell, 'main'));
}

// ── in-place: one row's state changes ────────────────────────
// The scope tabs belong to people.list, so the shell has to BE there or the
// dispatch lands on nothing and the measurement is of a no-op.
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
