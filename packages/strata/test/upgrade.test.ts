import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Sequence, Transform } from '../src';
import { runSourceUpgrade } from '../src/node';
import type { SourceDocument } from '../src/upgrade';

// The whole loop, against a temporary app: a lock, a plan, an edit, a verify.
// The "source" is a mutable list — editing it stands in for editing files.

const transform: Transform = (config, source) => (typeof config === 'function' ? config(source) : source);
const renameTitle = {
  description: 'Forms: title → heading',
  steps: [
    {
      kind: 'document' as const,
      at: 'acme.forms/form',
      transform: ({ document }: { document: Record<string, unknown> }) => {
        if (!('title' in document)) return document;
        const { title, ...rest } = document;
        return { ...rest, heading: title };
      },
    },
  ],
};
const forms = (migrations: Sequence['migrations']): Sequence => ({ id: 'acme.forms', documents: { form: {} }, migrations });
const schemas = { 'acme.forms/form': z.object({ heading: z.string(), fields: z.array(z.string()) }).strict() };

const app = () => {
  const root = mkdtempSync(join(tmpdir(), 'strata-upgrade-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'forms.ts'), "export const signup = { id: 'signup', title: 'Sign up', fields: ['email'] };\n");
  const source: SourceDocument[] = [
    { kind: 'acme.forms/form', id: 'signup', document: { id: 'signup', title: 'Sign up', fields: ['email'] } },
    { kind: 'acme.forms/form', id: 'contact', document: { id: 'contact', heading: 'Contact', fields: [] } },
  ];
  const lines: string[] = [];
  // Editing the source: artifact `id` now reads `document`.
  const edit = (id: string, document: unknown): void => {
    const at = source.findIndex((d) => d.id === id);
    if (at === -1) throw new Error(`no artifact ${id}`);
    source[at] = { kind: 'acme.forms/form', id, document };
  };
  const run = (grammars: readonly Sequence[], ...argv: string[]) =>
    runSourceUpgrade({ root, grammars, transform, schemas: { 'acme.forms/form': schemas['acme.forms/form'].extend({ id: z.string() }) }, documents: () => source, log: (l) => lines.push(l) }, argv);
  return { root, source, lines, run, edit, lock: () => JSON.parse(readFileSync(join(root, 'strata.lock.json'), 'utf8')) };
};

describe('strata upgrade — the loop', () => {
  it('no lock: status refuses and says how; init records the installed grammars once', async () => {
    const a = app();
    expect(await a.run([forms([])], 'status', '--check')).toBe(1);
    expect(a.lines.join('\n')).toContain('strata init');
    expect(await a.run([forms([])], 'init')).toBe(0);
    expect(a.lock()).toEqual({ grammar: { 'acme.forms': 0 } });
    expect(await a.run([forms([])], 'init')).toBe(1);
    expect(await a.run([forms([])], 'status', '--check')).toBe(0);
  });

  it('plan → edit → verify: the lock moves only when the source matches exactly', async () => {
    const a = app();
    await a.run([forms([])], 'init');
    const next = [forms([renameTitle])];

    // A newer grammar is installed: the source is behind.
    expect(await a.run(next, 'status', '--check')).toBe(1);

    // Plan.
    expect(await a.run(next, 'upgrade')).toBe(0);
    const work = join(a.root, '.strata', 'upgrade');
    const report = readFileSync(join(work, 'REPORT.md'), 'utf8');
    expect(report).toContain('`acme.forms/1` — Forms: title → heading');
    expect(report).toContain('### `signup`');
    expect(report).toContain('**File:** `src/forms.ts`');
    expect(report).toContain('- title');
    expect(report).toContain('+ heading');
    expect(report).not.toContain('### `contact`'); // already has a heading: untouched
    const expected = JSON.parse(readFileSync(join(work, 'expected', 'acme.forms_form', 'signup.json'), 'utf8'));
    expect(expected).toEqual({ id: 'signup', heading: 'Sign up', fields: ['email'] });

    // Verify before editing: refused, with what differs; the lock has not moved.
    expect(await a.run(next, 'verify')).toBe(1);
    expect(a.lines.join('\n')).toContain('signup does not match its migrated JSON yet');
    expect(a.lock()).toEqual({ grammar: { 'acme.forms': 0 } });

    // A wrong edit is still refused.
    a.edit('signup', { id: 'signup', heading: 'Signup', fields: ['email'] });
    expect(await a.run(next, 'verify')).toBe(1);

    // The right edit (key order is how a person wrote it, not content).
    a.edit('signup', { fields: ['email'], heading: 'Sign up', id: 'signup' });
    expect(await a.run(next, 'verify')).toBe(0);
    expect(a.lock()).toEqual({ grammar: { 'acme.forms': 1 } });
    expect(existsSync(join(a.root, '.strata'))).toBe(false);
    expect(await a.run(next, 'status', '--check')).toBe(0);
  });

  it('a marker migration: nothing to edit, verify just moves the lock', async () => {
    const a = app();
    a.edit('signup', { id: 'signup', heading: 'Sign up', fields: [] });
    await a.run([forms([])], 'init');
    const marked = [forms([{ description: 'Forms may have a subtitle', steps: [] }])];
    expect(await a.run(marked, 'upgrade')).toBe(0);
    expect(readFileSync(join(a.root, '.strata', 'upgrade', 'REPORT.md'), 'utf8')).toContain('## Nothing to edit');
    expect(await a.run(marked, 'verify')).toBe(0);
    expect(a.lock()).toEqual({ grammar: { 'acme.forms': 1 } });
  });

  it('verify refuses an artifact outside the plan that changed into something the migrations would rewrite', async () => {
    const a = app();
    await a.run([forms([])], 'init');
    const next = [forms([renameTitle])];
    await a.run(next, 'upgrade');
    a.edit('signup', { id: 'signup', heading: 'Sign up', fields: ['email'] });
    a.edit('contact', { id: 'contact', title: 'Contact', fields: [] }); // regressed while editing
    expect(await a.run(next, 'verify')).toBe(1);
    expect(a.lines.join('\n')).toContain('contact was not in the plan, but the migrations would change it now');
  });

  it('verify refuses a plan made for other grammars, and an artifact added since', async () => {
    const a = app();
    await a.run([forms([])], 'init');
    await a.run([forms([renameTitle])], 'upgrade');
    expect(await a.run([forms([renameTitle, { description: 'later', steps: [] }])], 'verify')).toBe(1);
    expect(a.lines.join('\n')).toContain('plan again');
    a.source.push({ kind: 'acme.forms/form', id: 'new', document: { id: 'new', heading: 'x', fields: [] } });
    a.edit('signup', { id: 'signup', heading: 'Sign up', fields: ['email'] });
    expect(await a.run([forms([renameTitle])], 'verify')).toBe(1);
    expect(a.lines.join('\n')).toContain('acme.forms/form:new is new since the plan');
  });

  it('a migration whose result fails the current schema stops the plan — no edit could pass', async () => {
    const a = app();
    await a.run([forms([])], 'init');
    const broken = { ...renameTitle, steps: [{ kind: 'document' as const, at: 'acme.forms/form', transform: ({ document }: { document: Record<string, unknown> }) => ({ ...document, heading: 42 }) }] };
    expect(await a.run([forms([broken])], 'upgrade')).toBe(1);
    expect(readFileSync(join(a.root, '.strata', 'upgrade', 'REPORT.md'), 'utf8')).toContain('## Stop: a migration is wrong');
  });

  it('a lock ahead of the installed grammars is refused', async () => {
    const a = app();
    writeFileSync(join(a.root, 'strata.lock.json'), JSON.stringify({ grammar: { 'acme.forms': 3 } }));
    expect(await a.run([forms([renameTitle])], 'status')).toBe(1);
    expect(a.lines.join('\n')).toContain('ahead of the installed grammars');
  });
});
