import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runShapeCheck } from '../src/shape';
import type { ShapeCheckConfig } from '../src/shape';

// Inside the package, so the app's `typescript` is found the way an app's own is: from its folder up.
const scratch = mkdtempSync(join(import.meta.dirname, '.shape-'));
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

  it('an app without a tsconfig.json is told so, and fails', () => {
    const lines: string[] = [];
    const root = appOf({});
    rmSync(join(root, 'tsconfig.json'));
    expect(runShapeCheck({ root, actions: [], log: (line) => lines.push(line) })).toBe(1);
    expect(lines.join('\n')).toContain('has none');
  });
});
