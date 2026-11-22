import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runShapeCheck } from '../src/shape';
import type { ShapeCheckConfig } from '../src/shape';
import { linkPackage } from './nisc';

const scratch = mkdtempSync(join(tmpdir(), 'nisc-shape-'));
linkPackage(scratch, 'typescript');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const TSCONFIG = {
  compilerOptions: { strict: true, target: 'ES2022', lib: ['ES2022'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', noEmit: true, types: [], baseUrl: '.', paths: { '@app/*': ['src/*'] } },
  include: ['src'],
};

const CLEAN: Record<string, string> = {
  'src/app/app.ts': "export type NiscApp = { actions: string[] };\nexport const buildApp = (seams: { functions: string[] }): NiscApp => ({ actions: seams.functions });\nexport const shell = { canvases: [] };\n",
  'src/server/boot.ts': "import { buildApp, shell } from '../app/app';\nexport const app = buildApp({ functions: [] });\nexport const canvases = shell.canvases;\n",
  'src/ui/kit.tsx': "// Intl. and session.roles in a comment are not code\nexport const label = 'document.querySelector(\"x\")';\n",
};

let made = 0;
const appOf = (files: Record<string, string>): string => {
  made += 1;
  const root = join(scratch, `app-${made}`);
  for (const [file, text] of Object.entries({ 'package.json': '{ "name": "shape-app", "private": true }', 'tsconfig.json': JSON.stringify(TSCONFIG), ...files })) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
};

const run = (files: Record<string, string>, config: Partial<ShapeCheckConfig> = {}): { code: number; lines: string[]; failed: (what: string) => string | undefined } => {
  const lines: string[] = [];
  const code = runShapeCheck({ root: appOf({ ...CLEAN, ...files }), actions: [], log: (line) => lines.push(line), ...config });
  return { code, lines, failed: (what) => lines.find((line) => line.startsWith('[fail]') && line.includes(what)) };
};

describe('runShapeCheck — what the shape of an app’s source says', () => {
  it('a clean app passes, and words in comments and strings are not code', () => {
    const { code, lines } = run({});
    expect(lines.filter((line) => line.startsWith('[fail]'))).toEqual([]);
    expect(code).toBe(0);
  });

  it('rule 16 by the compiler: assertions, "!", function declarations, classes, enums, "any", default exports — in src/ only', () => {
    const { code, failed } = run({
      'src/lib/bad.ts': [
        'export const a = (x: unknown) => x as string;',
        'export const b = (x: unknown) => <string>x;',
        'export const c = (x: string | undefined) => x!;',
        'export function d() { return 1; }',
        'export class E {}',
        'export enum F { G }',
        'export const h: any = 1;',
        'const i = 1;',
        'export default i;',
        'export const j = [1] as const;',
      ].join('\n'),
      'vite.config.ts': 'export default {};',
    });
    expect(code).toBe(1);
    const line = failed('rule 16') ?? '';
    for (const at of ['bad.ts:1 "as string"', 'bad.ts:2 a "<T>" assertion', 'bad.ts:3 a non-null', 'bad.ts:4 a function declaration', 'bad.ts:5 a class', 'bad.ts:6 an enum', 'bad.ts:7 "any"', 'bad.ts:9 a default export']) expect(line).toContain(at);
    expect(line).not.toContain('bad.ts:10');
    expect(line).not.toContain('vite.config');
  });

  it('formatting outside Prism, roles in server code, and the kit reaching past its own elements', () => {
    const { failed } = run({
      'src/server/fns.ts': 'export const when = (d: Date, session: { roles: string[] }) => [d.toLocaleDateString(), new Intl.NumberFormat().format(1), session.roles];',
      'src/dev/report.ts': 'export const n = (1).toLocaleString();',
      'src/ui/picker.ts': 'export const pick = (file: Blob) => { const reader = new FileReader(); reader.readAsDataURL(file); return [location.pathname, history.pushState({}, ""), document.querySelector(".other")]; };',
    });
    expect(failed('rule 9:')).toMatch(/src\/server\/fns\.ts:1 \.toLocaleDateString\(\).*Intl\.NumberFormat/);
    expect(failed('rule 9:')).not.toContain('src/dev/report.ts');
    expect(failed('rule 11')).toContain('src/server/fns.ts:1 session.roles');
    expect(failed('rule 9a')).toMatch(/FileReader.*readAsDataURL/);
    expect(failed('rule 4')).toMatch(/location\.pathname.*history\.pushState/);
    expect(failed('rule 2')).toContain('document.querySelector');
  });

  it('src/app is data: a function of it called from outside, through a path alias too — but the manifest’s factory', () => {
    const { failed } = run({
      'src/app/helpers.ts': 'export const wordsOf = (n: number): string => String(n);\nexport const LIMIT = 3;',
      'src/server/answer.ts': "import { wordsOf, LIMIT } from '@app/app/helpers';\nexport const said = wordsOf(LIMIT);",
    });
    const line = failed('src/app is data') ?? '';
    expect(line).toContain('src/server/answer.ts:1 wordsOf, a function of src/app/helpers.ts');
    expect(line).not.toContain('LIMIT');
    expect(line).not.toContain('buildApp');
  });

  const today = { 'src/server/today.ts': "export const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());" };

  it('a file allowed a rule, with why, passes it', () => {
    expect(run(today, { allow: { formatting: { 'src/server/today.ts': 'the studio’s day, put in every read’s scope' } } }).code).toBe(0);
  });

  it('an allowance with no reason, for a file that is not there, or allowing nothing, fails', () => {
    const { failed } = run(today, { allow: { formatting: { 'src/server/today.ts': ' ', 'src/server/gone.ts': 'x' }, roles: { 'src/server/today.ts': 'x' } } });
    const line = failed('every allowance') ?? '';
    expect(line).toContain('formatting: src/server/today.ts gives no reason');
    expect(line).toContain('formatting: src/server/gone.ts does not exist');
    expect(line).toContain('roles: src/server/today.ts has nothing to allow');
  });

  it('every server function an action calls is named with its reason, and every one named is called', () => {
    const actions = [
      { id: 'list', endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'rows/all', context: {} } }, ask: { fn: 'ask' }, mail: { fn: 'mail.send' } } },
      { id: 'any', endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: { $ref: '$.read' } } } } },
    ];
    const entries = [
      { fingerprint: 'rows/all', dsl: {}, refresh: 'reactive', mapping: {} },
      { fingerprint: 'rows/live', dsl: {}, refresh: 'reactive' },
      { fingerprint: 'rows/add', mutation: {} },
    ];
    const { failed, lines } = run({}, { actions, entries, functions: { ask: 'the model', 'old.one': 'nothing calls it', 'mail.send': '' } });
    expect(failed('every server function an action calls')).toContain('mail.send');
    expect(failed('every function named in')).toContain('old.one');
    expect(lines).toContain('[info] actions call server functions 2 times and replay vex 2 times');
    expect(lines).toContain('[info] 1 of 2 reads word their rows with a Prism mapping');
    expect(lines).toContain('[info] reactive reads no action replays by name: rows/live');
  });

  it('"<const>" is "as const" written the other way, and passes rule 16', () => {
    const { code, lines } = run({ 'src/lib/names.ts': "export const names = <const>['a', 'b'];" });
    expect(lines.filter((line) => line.startsWith('[fail]'))).toEqual([]);
    expect(code).toBe(0);
  });

  describe('what a name refers to: other spellings of a reach are reported, never failed', () => {
    const DOM = { ...TSCONFIG, compilerOptions: { ...TSCONFIG.compilerOptions, lib: ['ES2022', 'DOM'] } };
    const SPELLINGS: Record<string, string> = {
      'tsconfig.json': JSON.stringify(DOM),
      'node_modules/@niscorp/moss/package.json': '{ "name": "@niscorp/moss", "types": "index.d.ts" }',
      'node_modules/@niscorp/moss/index.d.ts': 'export type FunctionSession = { roles: readonly string[]; principal: string };\n',
      'src/app/helpers.ts': 'export const wordsOf = (n: number): string => String(n);\n',
      'src/server/destructured.ts': "import type { FunctionSession } from '@niscorp/moss';\nexport const who = (session: FunctionSession) => { const { roles } = session; return roles; };\n",
      'src/server/taken.ts': 'const { NumberFormat } = Intl;\nexport const n = new NumberFormat().format(1);\n',
      'src/server/global.ts': 'export const d = new globalThis.Intl.DateTimeFormat().format(new Date());\n',
      'src/ui/where.ts': 'const { pathname } = window.location;\nexport const here = pathname;\n',
      'src/ui/found.ts': "export const found = window['document'].querySelector('.x');\n",
      'src/server/namespace.ts': "import * as helpers from '../app/helpers';\nexport const said = helpers.wordsOf(1);\n",
      'src/server/passed.ts': "export { wordsOf } from '../app/helpers';\n",
      'src/server/later.ts': "export const later = async () => {\n  const { wordsOf } = await import('../app/helpers');\n  return wordsOf(2);\n};\n",
    };
    const infoOf = (lines: readonly string[]): string[] => lines.filter((line) => line.startsWith('[info]') && line.includes('another spelling'));

    it('the eight spellings the rules miss are each one [info] line at their file and line, and the exit code is 0', () => {
      const { code, lines } = run(SPELLINGS);
      const info = infoOf(lines);
      for (const at of [
        'rule 11: src/server/destructured.ts:2 roles',
        'rule 9: src/server/taken.ts:1 Intl',
        'rule 9: src/server/global.ts:1 Intl',
        'rule 4: src/ui/where.ts:1 location',
        'rule 2: src/ui/found.ts:1 querySelector',
        'src/app is data: src/server/namespace.ts:2 wordsOf',
        'src/app is data: src/server/passed.ts:1 wordsOf',
        'src/app is data: src/server/later.ts:2 wordsOf',
      ]) {
        expect(info.filter((line) => line.includes(at))).toHaveLength(1);
      }
      expect(info).toHaveLength(8);
      expect(lines.filter((line) => line.startsWith('[fail]'))).toEqual([]);
      expect(code).toBe(0);
    });

    it('a file the app allows a rule is not reported for it', () => {
      const info = infoOf(run(SPELLINGS, { allow: { formatting: { 'src/server/global.ts': 'the studio’s day' } } }).lines);
      expect(info.some((line) => line.includes('src/server/global.ts'))).toBe(false);
      expect(info.some((line) => line.includes('src/server/taken.ts'))).toBe(true);
    });

    it('a type-only reference to a function of src/app is not a reach, and is not reported', () => {
      const { code, lines } = run({
        ...SPELLINGS,
        'src/server/typed.ts': "import type { wordsOf } from '../app/helpers';\nexport type Words = typeof wordsOf;\n",
        'src/server/typed-one.ts': "import { type wordsOf as w } from '../app/helpers';\nexport type Words = typeof w;\n",
        'src/server/typed-out.ts': "export type { wordsOf } from '../app/helpers';\n",
      });
      expect(infoOf(lines).some((line) => line.includes('src/server/typed'))).toBe(false);
      expect(code).toBe(0);
    });

    it('a name the rules already fail in that file is not reported again', () => {
      const { failed, lines } = run({
        ...SPELLINGS,
        'src/server/named.ts': "import * as helpers from '../app/helpers';\nimport { wordsOf } from '../app/helpers';\nexport const said = [wordsOf(1), helpers.wordsOf(2)];\n",
        'src/server/both.ts': "const { NumberFormat } = Intl;\nexport const n = [new NumberFormat().format(1), new Intl.PluralRules().select(1)];\n",
      });
      expect(failed('src/app is data')).toContain('src/server/named.ts:2 wordsOf');
      expect(failed('rule 9:')).toContain('src/server/both.ts:2 Intl.PluralRules');
      expect(infoOf(lines).some((line) => line.includes('src/server/named.ts') || line.includes('src/server/both.ts'))).toBe(false);
    });
  });

  it('an app without a tsconfig.json is told so, and fails', () => {
    const lines: string[] = [];
    const root = appOf({});
    rmSync(join(root, 'tsconfig.json'));
    expect(runShapeCheck({ root, actions: [], log: (line) => lines.push(line) })).toBe(1);
    expect(lines.join('\n')).toContain('has none');
  });
});
