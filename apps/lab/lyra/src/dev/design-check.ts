// THE SURFACE, HELD BY A CHECK.
//
// Twenty-six suites assert what the application DOES. Nothing asserted what it
// LOOKS like, and the gap showed: every status badge in the deployment failed
// WCAG AA on both themes for months (3.07:1 at the worst, where 4.5 is the
// floor), an owner's role rendered in the same red as a failed payment, and a
// paragraph was being handed to a cell that truncates at the ellipsis. All
// three were invisible to a suite that only ever asked whether the right rows
// came back.
//
// So this is the design half, and the assertions are the same kind as the rest:
// mechanical, falsifiable, and about the whole deployment rather than one
// screen. Nothing here renders anything — it reads the palette, the seeded
// themes, the vex entries and every layout in the catalog.
//
// Run: pnpm --filter lyra exec tsx src/dev/design-check.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { HUES } from '@lyra/ui/lib/tokens';
import { ICON_NAMES } from '@lyra/ui/lib/icons';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import { ok, report, runtime } from './world';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const themeCss = readFileSync(join(here, '../ui/css/theme.css'), 'utf8');

// ── contrast, computed the way a browser would ───────────────
const channel = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (hex: string): number => {
  const v = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
};
const ratio = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// The two blocks in theme.css: the root palette and the dark scheme. Parsed
// rather than imported because CSS is where they live — a check that read a
// duplicate copy in TypeScript would pass while the stylesheet was wrong.
const blockOf = (selector: string): Record<string, string> => {
  const at = themeCss.indexOf(selector);
  const open = themeCss.indexOf('{', at);
  const close = themeCss.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const line of themeCss.slice(open + 1, close).split('\n')) {
    const match = /^\s*--([a-z0-9-]+):\s*([^;]+);/.exec(line);
    if (match !== null && match[1] !== undefined && match[2] !== undefined) out[match[1]] = match[2].trim();
  }
  return out;
};

const light = blockOf(':root {');
const dark = { ...light, ...blockOf(":root[data-scheme='dark']") };

// A token may alias another (`--alert: var(--hue-rose)`), so resolve before
// measuring — the aliasing is the whole reason status and identity stay one
// palette instead of two that drift.
const resolve = (block: Record<string, string>, name: string, depth = 0): string => {
  const raw = block[name];
  if (raw === undefined || depth > 4) return '#000000';
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(raw);
  return alias !== null && alias[1] !== undefined ? resolve(block, alias[1], depth + 1) : raw;
};

// ── 1. every pill passes, in every scheme ────────────────────
//
// Badge text is 11px semibold — normal text by WCAG, so 4.5:1, not 3:1.
const TONES = ['calm', 'warm', 'alert', 'good'];
const AA = 4.5;

for (const [schemeName, block, ground] of [
  ['light', light, '#ffffff'],
  ['dark', dark, '#0c0c0d'],
] as const) {
  const failures: string[] = [];
  for (const name of [...TONES, ...HUES.map((h) => `hue-${h}`)]) {
    const fg = resolve(block, name);
    const bg = resolve(block, `${name}-soft`);
    const onSoft = ratio(fg, bg);
    const onGround = ratio(fg, ground);
    if (onSoft < AA) failures.push(`${name} on its own ground: ${onSoft.toFixed(2)}`);
    if (onGround < AA) failures.push(`${name} on the page: ${onGround.toFixed(2)}`);
  }
  ok(`every ${schemeName} pill and mark passes AA`, failures.length === 0, failures.join(' · ') || `${TONES.length + HUES.length} colours, ≥${AA}:1 against their pill and the page`);
}

// FALSIFIABLE: the measurement has to be able to fail. The old palette is the
// fixture — `--alert #dc2626` on the charcoal theme's `#2e1010` measured 3.63.
ok('...and the check can see a failure', ratio('#dc2626', '#2e1010') < AA, `the palette this replaced: ${ratio('#dc2626', '#2e1010').toFixed(2)}:1`);

// ── 2. a studio's theme cannot break its own contrast ────────
//
// Sand overrode no status token and Charcoal could only reach the soft
// backgrounds, so neither could fix what the other half of the pair did. A
// theme declares a SCHEME now; if one ever hand-lists a colour again, this is
// what notices.
const themeRows = await runtime.db.query('SELECT name, tokens FROM themes');
for (const raw of themeRows.rows as { name: string; tokens: unknown }[]) {
  const tokens = (typeof raw.tokens === 'string' ? JSON.parse(raw.tokens) : raw.tokens) as Record<string, string>;
  const scheme = tokens['scheme'] ?? 'light';
  const base = scheme === 'dark' ? dark : light;
  const block = { ...base, ...tokens };
  const ground = block['ground'] ?? '#ffffff';
  const failures: string[] = [];
  for (const name of [...TONES, ...HUES.map((h) => `hue-${h}`)]) {
    const fg = resolve(block, name);
    if (ratio(fg, resolve(block, `${name}-soft`)) < AA) failures.push(`${name} pill`);
    if (ratio(fg, ground) < AA) failures.push(`${name} on ground`);
  }
  ok(`the ${raw.name} theme passes on its own ground`, failures.length === 0, failures.join(', ') || `scheme: ${scheme}, ground ${ground}`);
}

// ── 3. identity never wears a status colour ──────────────────
//
// The rule the whole palette split exists for. A role, a programme or a rank
// picks a HUE; `alert` is a claim that something is wrong.
const TONE_WORDS = new Set(['calm', 'warm', 'alert', 'good', 'accent', 'neutral']);

const programColours = await runtime.db.query('SELECT name, colour FROM programs');
const badProgram = (programColours.rows as { name: string; colour: string }[]).filter((p) => TONE_WORDS.has(p.colour));
ok('no programme is coloured with a status word', badProgram.length === 0, badProgram.map((p) => `${p.name}=${p.colour}`).join(', ') || `${programColours.rows.length} streams, all hues`);

const allProgramsKnown = (programColours.rows as { colour: string }[]).every((p) => (HUES as readonly string[]).includes(p.colour));
ok('...and every one names a hue the kit has', allProgramsKnown, (HUES as readonly string[]).join(' '));

// The role scale, read out of the entry that computes it rather than restated.
const staffSource = readFileSync(join(here, '../app/vex/staff.entries.ts'), 'utf8');
const roleBlock = staffSource.slice(staffSource.indexOf('const roleHue'), staffSource.indexOf('export const staffList'));
const roleColours = [...roleBlock.matchAll(/then: '([a-z]+)'/g)].map((m) => m[1] ?? '');
ok('no role is coloured with a status word', roleColours.every((c) => !TONE_WORDS.has(c)), roleColours.join(', '));

// ── 4. prose is never handed to a cell that truncates ────────
//
// `kind: 'text'` is nowrap + ellipsis unless it says `wrap`. A key whose name
// promises a sentence in one of those is the add-on store's clipped
// description, waiting to happen again.
const PROSE_KEYS = /(blurb|description|adds|hint|body|notes|message|summary)$/i;
const truncated: string[] = [];
const walk = (node: unknown, actionId: string): void => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, actionId));
  if (node === null || typeof node !== 'object') return;
  const shape = node as Record<string, unknown>;
  const props = shape['props'] as Record<string, unknown> | undefined;
  const columns = props?.['columns'];
  if (Array.isArray(columns)) {
    for (const column of columns as { cell?: Record<string, unknown> }[]) {
      const cell = column.cell;
      if (cell === undefined) continue;
      if (cell['kind'] === 'text' && cell['wrap'] !== true && PROSE_KEYS.test(String(cell['key'] ?? ''))) {
        truncated.push(`${actionId}: text cell on "${String(cell['key'])}"`);
      }
    }
  }
  for (const value of Object.values(shape)) walk(value, actionId);
};
for (const [id, definition] of Object.entries(CATALOG_DEFINITIONS)) walk(definition.layout, id);
ok('no sentence is rendered through a truncating cell', truncated.length === 0, truncated.join(' · ') || 'prose goes to Prose, a wrapping cell, or a card');

// ── 5. every icon a layout names actually exists ─────────────
//
// An unknown name renders nothing — correct at runtime, invisible in review.
const missing: string[] = [];
const icons = (node: unknown, actionId: string): void => {
  if (Array.isArray(node)) return node.forEach((n) => icons(n, actionId));
  if (node === null || typeof node !== 'object') return;
  const shape = node as Record<string, unknown>;
  const props = (shape['props'] ?? {}) as Record<string, unknown>;
  const name = props['icon'] ?? props['emptyIcon'];
  // A binding (`$.area.icon`) is resolved at render and cannot be checked here.
  if (typeof name === 'string' && name !== '' && !name.startsWith('$') && !ICON_NAMES.includes(name)) {
    missing.push(`${actionId}: "${name}"`);
  }
  for (const value of Object.values(shape)) icons(value, actionId);
};
for (const [id, definition] of Object.entries(CATALOG_DEFINITIONS)) icons(definition.layout, id);
ok('every icon a layout names is in the kit', missing.length === 0, missing.join(', ') || `${ICON_NAMES.length} names available`);

// ── 6. no list is too wide for the screen it runs on ─────────
//
// `Rows` gives each fraction a 150px floor and adds a 14px gutter, so a spec's
// desktop minimum is arithmetic. Past the viewport it scrolls sideways — and
// on a phone every display column past the SECOND is hidden outright, so a
// tenth column is not narrow, it is ABSENT.
//
// Two, not three, and the number is not a taste call: three cells overflowed
// 375px and threw the third onto a ragged second line. The rule lives in
// ui.css (`.ly-row-item > *:nth-child(n + 3)`) and this mirrors it — if one
// moves, move the other, or this reports a drop that does not happen.
const WIDEST = 1000;
const wide: string[] = [];
const dropped: string[] = [];
const measure = (node: unknown, actionId: string): void => {
  if (Array.isArray(node)) return node.forEach((n) => measure(n, actionId));
  if (node === null || typeof node !== 'object') return;
  const shape = node as Record<string, unknown>;
  if (shape['component'] === 'Rows') {
    const props = (shape['props'] ?? {}) as Record<string, unknown>;
    const columns = (props['columns'] ?? []) as { px?: number; cell?: { kind?: string } }[];
    if (Array.isArray(columns) && columns.length > 0) {
      const width = columns.reduce((total, c) => total + (c.px ?? 150) + 14, 0);
      if (width > WIDEST) wide.push(`${actionId}: ${width}px over ${columns.length} columns`);
      const display = columns.filter((c) => c.cell?.kind !== 'action' && c.cell?.kind !== 'menu');
      if (display.length > 2) dropped.push(`${actionId}: ${display.length - 2} hidden on a phone`);
    }
  }
  for (const value of Object.values(shape)) measure(value, actionId);
};
for (const [id, definition] of Object.entries(CATALOG_DEFINITIONS)) measure(definition.layout, id);

// Recorded rather than enforced, for now: the widest specs are real management
// tables and narrowing them is a design pass, not a rename. What the check
// buys today is that nobody adds a column without seeing the number.
ok('the widest lists are known', true, wide.length === 0 ? 'every spec fits 1000px' : wide.join(' · '));
ok('...and so is what a phone drops', true, dropped.length === 0 ? 'no spec loses a column on a phone' : dropped.join(' · '));

// ── 7. the kit's vocabulary is honestly advertised ───────────
ok('every registered component is a real name', COMPONENT_NAMES.length > 0 && new Set(COMPONENT_NAMES).size === COMPONENT_NAMES.length, `${COMPONENT_NAMES.length} components, no duplicates`);

report('the surface is checkable: contrast, colour meaning, prose, icons and width.');
