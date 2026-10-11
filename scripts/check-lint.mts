// Does the lint fail on what it says it fails on?
//
// The module block of `eslint.config.mjs` is a gate: it is what stops a cast,
// an `any`, a function of 1,345 lines. A reviewer read it as an adversary and
// found six things it let through, each of them written the way the rule did
// not expect: `const row: Row = JSON.parse(text)` for a cast, a type predicate
// for a cast, `export let` for a `let`, a comment that switched the rules off,
// code in the one file the pattern skipped. A rule nobody has tried to break
// only looks strict.
//
// So each rule of the block is tried here, on every run. A case is a few
// lines of source linted AS IF it were a file the block holds, with the real
// configuration. `bad` must raise the rule named, and `good`, the same thing
// done by the rules, must raise nothing at all, not even a warning. The text
// stands in for a file that exists (the compiler's types are read through its
// package's own tsconfig), and the file on disk is not touched.
//
// WHAT THIS DOES NOT TRY. That `pnpm lint` is handed every file: the
// arguments of that script are a line in `package.json`, and a directory
// added to a package and not to that line is linted by nothing. And the
// rules of the other blocks (lyra's fences, the packages' four): they have no
// cases here.
//
// `pnpm lint` runs this before it lints. Exits non-zero on any failure.

import { resolve } from 'node:path';
import { ESLint } from 'eslint';

const root = resolve(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: root });

// Files the block holds, one of each kind: a file in a moss module, the file
// at the top of moss's `src/`, and the two of tide's that came out of moss.
const MODULE = 'packages/moss/src/data/span.ts';
const TOP = 'packages/moss/src/index.ts';
const TIDE_STORE = 'packages/tide/src/store/postgres/pool.ts';
const TIDE_DRIVER = 'packages/tide/src/driver.ts';

const ROW = 'type Row = { id: string };\n';
const SYNTAX = 'no-restricted-syntax';

// `count` lines of code that do nothing, inside a function.
const filler = (count: number): string => Array.from({ length: count }, (_, index) => `  void ${index};\n`).join('');
const functionOf = (lines: number): string => `export const long = (): void => {\n${filler(lines - 2)}};\n`;
const fileOf = (lines: number): string => Array.from({ length: lines }, (_, index) => `export const n${index} = ${index};\n`).join('');
const lineOf = (width: number): string => `export const wide = '${'x'.repeat(width - "export const wide = '';".length)}';\n`;

type Case = {
  what: string;
  // the rule `bad` must raise, and a few words its message must hold when one rule has many messages
  rule: string;
  says?: string;
  bad: string;
  good: string;
  file?: string;
};

const CASES: readonly Case[] = [
  {
    what: 'an `any` given a type by assigning it: `const row: Row = JSON.parse(text)`',
    rule: '@typescript-eslint/no-unsafe-assignment',
    bad: `${ROW}export const read = (text: string): Row => {\n  const row: Row = JSON.parse(text);\n  return row;\n};\n`,
    good: 'export const read = (text: string): unknown => {\n  const row: unknown = JSON.parse(text);\n  return row;\n};\n',
  },
  {
    what: 'an `any` given a type by returning it',
    rule: '@typescript-eslint/no-unsafe-return',
    bad: `${ROW}export const read = (text: string): Row => JSON.parse(text);\n`,
    good: 'export const read = (text: string): unknown => JSON.parse(text);\n',
  },
  {
    what: 'an `any` given a type by a generic that nothing fills in',
    rule: '@typescript-eslint/no-unsafe-return',
    bad: `${ROW}const parse = <T = Row>(text: string): T => JSON.parse(text);\nexport const read = (text: string): Row => parse(text);\n`,
    good: 'const parse = (text: string): unknown => JSON.parse(text);\nexport const read = (text: string): unknown => parse(text);\n',
  },
  {
    what: 'an `any` read from',
    rule: '@typescript-eslint/no-unsafe-member-access',
    bad: 'export const read = (text: string): unknown => JSON.parse(text).id;\n',
    good: "export const read = (text: string): unknown => {\n  const value: unknown = JSON.parse(text);\n  return typeof value === 'object' && value !== null && 'id' in value ? value.id : undefined;\n};\n",
  },
  {
    what: 'an `any` called',
    rule: '@typescript-eslint/no-unsafe-call',
    bad: 'export const run = (text: string): unknown => JSON.parse(text)();\n',
    good: "export const run = (text: string): unknown => {\n  const value: unknown = JSON.parse(text);\n  return typeof value === 'function' ? Reflect.apply(value, undefined, []) : undefined;\n};\n",
  },
  {
    what: 'an `any` handed to a typed parameter',
    rule: '@typescript-eslint/no-unsafe-argument',
    bad: `${ROW}const idOf = (row: Row): string => row.id;\nexport const read = (text: string): string => idOf(JSON.parse(text));\n`,
    good: `${ROW}const idOf = (row: Row): string => row.id;\nexport const read = (): string => idOf({ id: 'a' });\n`,
  },
  {
    what: '`any` written out',
    rule: '@typescript-eslint/no-explicit-any',
    bad: 'export const keep = (value: any): unknown => value;\n',
    good: 'export const keep = (value: unknown): unknown => value;\n',
  },
  {
    what: 'a type assertion',
    rule: SYNTAX,
    says: 'no type assertion',
    bad: `${ROW}export const read = (value: unknown): Row => value as Row;\n`,
    good: "export const KINDS = ['a', 'b'] as const;\n",
  },
  {
    what: 'a type assertion in angle brackets, through `unknown`',
    rule: SYNTAX,
    says: 'no type assertion',
    bad: `${ROW}export const read = (value: string): Row => <Row>(<unknown>value);\n`,
    good: `${ROW}export const made = { id: 'a' } satisfies Row;\n`,
  },
  {
    what: 'a written type predicate',
    rule: SYNTAX,
    says: 'no written type predicate',
    bad: `${ROW}const isRow = (value: unknown): value is Row => true;\nexport const read = (value: unknown): Row | undefined => (isRow(value) ? value : undefined);\n`,
    good: "export const strings = (values: readonly unknown[]): string[] => values.filter((value) => typeof value === 'string');\n",
  },
  {
    what: 'an assertion function',
    rule: SYNTAX,
    says: 'no written type predicate',
    bad: `${ROW}const assertRow: (value: unknown) => asserts value is Row = () => undefined;\nexport const read = (value: unknown): Row => {\n  assertRow(value);\n  return value;\n};\n`,
    good: "export const read = (value: unknown): string => {\n  if (typeof value !== 'string') throw new Error('not text');\n  return value;\n};\n",
  },
  {
    what: 'a non-null assertion',
    rule: SYNTAX,
    says: 'no non-null assertion',
    bad: 'export const first = (values: string[]): string => values[0]!;\n',
    good: "export const first = (values: string[]): string => values[0] ?? '';\n",
  },
  {
    what: 'a declaration with `!`',
    rule: SYNTAX,
    says: 'on a declaration',
    bad: 'export const late = (): string => {\n  let value!: string;\n  return value;\n};\n',
    good: "export const late = (): string => {\n  const value = 'a';\n  return value;\n};\n",
  },
  {
    what: 'a `function` declaration',
    rule: SYNTAX,
    says: '`function` declaration',
    bad: 'export function made(): number {\n  return 1;\n}\n',
    good: 'export const made = (): number => 1;\n',
  },
  {
    what: '`let` at the top of a file',
    rule: SYNTAX,
    says: 'process-global state',
    bad: 'let counter = 0;\nexport const bump = (): number => {\n  counter += 1;\n  return counter;\n};\n',
    good: 'export const counterOf = (): (() => number) => {\n  let counter = 0;\n  return () => {\n    counter += 1;\n    return counter;\n  };\n};\n',
  },
  {
    what: '`export let`',
    rule: SYNTAX,
    says: 'process-global state',
    bad: 'export let counter = 0;\nexport const bump = (): void => {\n  counter += 1;\n};\n',
    good: 'export const START = 0;\n',
  },
  { what: '`var` at the top of a file', rule: SYNTAX, says: 'process-global state', bad: 'var counter = 0;\nexport const read = (): number => counter;\n', good: 'const counter = 0;\nexport const read = (): number => counter;\n' },
  { what: 'an enum', rule: SYNTAX, says: 'no enum', bad: 'export enum Kind {\n  One,\n}\n', good: "export type Kind = 'one' | 'two';\n" },
  {
    what: 'a class',
    rule: SYNTAX,
    says: 'no class',
    bad: 'export class Counter {\n  count = 0;\n}\n',
    good: "export class RefusedError extends Error {\n  code = 'refused';\n}\n",
  },
  { what: 'a default export', rule: SYNTAX, says: 'no default export', bad: 'const made = 1;\nexport default made;\n', good: 'export const made = 1;\n' },
  {
    what: 'a cast under `/* eslint-disable */`',
    rule: SYNTAX,
    says: 'no type assertion',
    bad: `/* eslint-disable */\n${ROW}export const read = (value: unknown): Row => value as Row;\n`,
    good: `${ROW}export const made: Row = { id: 'a' };\n`,
  },
  {
    what: 'a cast under `// eslint-disable-next-line`',
    rule: SYNTAX,
    says: 'no type assertion',
    bad: `${ROW}// eslint-disable-next-line no-restricted-syntax\nexport const read = (value: unknown): Row => value as Row;\n`,
    good: `${ROW}// what follows is a row\nexport const made: Row = { id: 'a' };\n`,
  },
  {
    what: '`@ts-expect-error`',
    rule: '@typescript-eslint/ban-ts-comment',
    bad: `${ROW}// @ts-expect-error\nexport const read = (value: unknown): Row => value;\n`,
    good: `${ROW}export const read = (value: Row): Row => value;\n`,
  },
  { what: '`@ts-ignore`', rule: '@typescript-eslint/ban-ts-comment', bad: `${ROW}// @ts-ignore\nexport const read = (value: unknown): Row => value;\n`, good: 'export const one = 1;\n' },
  { what: '`@ts-nocheck`', rule: '@typescript-eslint/ban-ts-comment', bad: `// @ts-nocheck\n${ROW}export const read = (value: unknown): Row => value;\n`, good: '// checked like every file\nexport const one = 1;\n' },
  { what: 'a line 201 wide', rule: 'max-len', bad: lineOf(201), good: lineOf(200) },
  { what: 'a function of 101 lines of code', rule: 'max-lines-per-function', bad: functionOf(101), good: functionOf(100) },
  { what: 'a file of 401 lines of code', rule: 'max-lines', bad: fileOf(401), good: fileOf(400) },
  {
    what: 'a cast and a `function` in the file at the top of src/',
    rule: SYNTAX,
    says: 'no type assertion',
    file: TOP,
    bad: `${ROW}export function read(value: unknown): Row {\n  return value as Row;\n}\n`,
    good: "export { MOSS_SEQUENCE } from './data';\n",
  },
  {
    what: "a cast in tide's Postgres store",
    rule: SYNTAX,
    says: 'no type assertion',
    file: TIDE_STORE,
    bad: `${ROW}export const read = (value: unknown): Row => value as Row;\n`,
    good: `${ROW}export const made: Row = { id: 'a' };\n`,
  },
  {
    what: "an `any` given a type in tide's driver",
    rule: '@typescript-eslint/no-unsafe-assignment',
    file: TIDE_DRIVER,
    bad: `${ROW}export const read = (text: string): Row => {\n  const row: Row = JSON.parse(text);\n  return row;\n};\n`,
    good: `${ROW}export const made: Row = { id: 'a' };\n`,
  },
];

const lines: string[] = [];
let failed = false;
const ok = (label: string, passed: boolean, detail = ''): void => {
  lines.push(`[${passed ? 'pass' : 'fail'}] ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!passed) failed = true;
};

type Raised = { rule: string; message: string; warning: boolean };
const lint = async (file: string, text: string): Promise<Raised[]> => {
  const results = await eslint.lintText(text, { filePath: resolve(root, file) });
  return results.flatMap((result) => result.messages).map((message) => ({ rule: message.ruleId ?? 'eslint', message: message.message, warning: message.severity !== 2 }));
};
const told = (raised: readonly Raised[]): string => raised.map((one) => `${one.rule}: ${one.message.slice(0, 80)}`).join('; ') || 'nothing';

for (const one of CASES) {
  const file = one.file ?? MODULE;
  const bad = await lint(file, one.bad);
  const good = await lint(file, one.good);
  const caught = bad.some((raised) => !raised.warning && raised.rule === one.rule && raised.message.includes(one.says ?? ''));
  ok(
    `the lint fails on ${one.what}, and passes on its twin`,
    caught && good.length === 0,
    caught && good.length === 0 ? '' : `${caught ? '' : `the bad one did not raise ${one.rule}${one.says === undefined ? '' : ` ("${one.says}")`}: it raised ${told(bad)}. `}${good.length === 0 ? '' : `the twin raised ${told(good)}`}`,
  );
}

// A comment that would switch a rule off is itself said, so that `pnpm lint`
// (which allows no warning) fails on one in a file that breaks no rule.
const inert = await lint(MODULE, '/* eslint-disable */\nexport const one = 1;\n');
ok('the lint says so when a comment tries to switch it off', inert.some((raised) => raised.message.includes('noInlineConfig')), told(inert));

for (const line of lines) console.log(line);
if (failed) process.exit(1);
