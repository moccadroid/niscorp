import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createUpgrader, type Sequence, type Transform } from '../src';
import { snapshotOf, snapshotText, compareSnapshot, checkCorpus } from '../src/check';

const transform: Transform = (config, source) => (typeof config === 'function' ? config(source) : source);

const formV0 = z.object({ title: z.string().describe('What the form is called.') }).strict();
const forms = (migrations: Sequence['migrations'] = []): Sequence => ({ id: 'acme.forms', documents: { form: {} }, migrations });

describe('snapshot — did the grammar change?', () => {
  it('the same schema is the same snapshot', () => {
    const a = snapshotOf(forms(), { 'acme.forms/form': formV0 });
    const b = snapshotOf(forms(), { 'acme.forms/form': formV0 });
    expect(compareSnapshot(a, b)).toEqual({ status: 'same' });
    expect(a.version).toBe(0);
  });

  it('rewording a .describe() is not a change — prose is not the grammar', () => {
    const reworded = z.object({ title: z.string().describe('The form\'s name, shown at the top.') }).strict();
    const recorded = snapshotOf(forms(), { 'acme.forms/form': formV0 });
    expect(compareSnapshot(recorded, snapshotOf(forms(), { 'acme.forms/form': reworded }))).toEqual({ status: 'same' });
  });

  it('an added field is a change, and says where', () => {
    const grown = z.object({ title: z.string(), submitLabel: z.string().optional() }).strict();
    const result = compareSnapshot(snapshotOf(forms(), { 'acme.forms/form': formV0 }), snapshotOf(forms(), { 'acme.forms/form': grown }));
    expect(result.status).toBe('changed');
    if (result.status === 'changed') expect(result.changes[0]?.lines).toContain('+ properties.submitLabel');
  });

  it('a changed type says from what to what', () => {
    const retyped = z.object({ title: z.number() }).strict();
    const result = compareSnapshot(snapshotOf(forms(), { 'acme.forms/form': formV0 }), snapshotOf(forms(), { 'acme.forms/form': retyped }));
    expect(result.status === 'changed' && result.changes[0]?.lines[0]).toBe('~ properties.title.type: "string" → "number"');
  });

  it('no recorded snapshot for the current version is "missing"', () => {
    expect(compareSnapshot(undefined, snapshotOf(forms(), { 'acme.forms/form': formV0 }))).toEqual({ status: 'missing' });
  });

  it('schemas must cover exactly the grammar\'s kinds', () => {
    expect(() => snapshotOf(forms(), {})).toThrow(expect.objectContaining({ code: 'UNKNOWN_KIND' }));
    expect(() => snapshotOf(forms(), { 'acme.forms/form': formV0, 'acme.forms/page': formV0 })).toThrow(expect.objectContaining({ code: 'UNKNOWN_KIND' }));
  });

  it('the snapshot text is stable — sorted keys, one newline', () => {
    const text = snapshotText(snapshotOf(forms(), { 'acme.forms/form': formV0 }));
    expect(text).toBe(snapshotText(JSON.parse(text)));
    expect(text.endsWith('}\n')).toBe(true);
  });
});

describe('corpus — do old documents survive?', () => {
  const old = [
    { id: 'signup', kind: 'acme.forms/form', stamp: { 'acme.forms': 0 }, document: { title: 'Sign up' } },
    { id: 'contact', kind: 'acme.forms/form', stamp: { 'acme.forms': 0 }, document: { title: 'Contact' } },
  ];

  it('documents that pass the current schema pass', async () => {
    const report = await checkCorpus(await createUpgrader([forms()], { transform }), { 'acme.forms/form': formV0 }, old);
    expect(report).toEqual({ passed: 2, failures: [] });
  });

  it('a breaking schema change WITHOUT a migration fails the old documents, naming why', async () => {
    const renamed = z.object({ heading: z.string() }).strict();
    const report = await checkCorpus(await createUpgrader([forms()], { transform }), { 'acme.forms/form': renamed }, old);
    expect(report.passed).toBe(0);
    expect(report.failures[0]?.reason).toContain('title');
  });

  it('the same change WITH its migration passes — the corpus is judged after upgrading', async () => {
    const renamed = z.object({ heading: z.string() }).strict();
    const migration = {
      description: 'title → heading',
      steps: [{ kind: 'document' as const, at: 'acme.forms/form', transform: ({ document }: { document: Record<string, unknown> }) => ({ heading: document['title'] }) }],
    };
    const report = await checkCorpus(await createUpgrader([forms([migration])], { transform }), { 'acme.forms/form': renamed }, old);
    expect(report).toEqual({ passed: 2, failures: [] });
  });

  it('a document captured by newer code than this is a failure, not a pass', async () => {
    const future = [{ id: 'x', kind: 'acme.forms/form', stamp: { 'acme.forms': 3 }, document: { title: 'x' } }];
    const report = await checkCorpus(await createUpgrader([forms()], { transform }), { 'acme.forms/form': formV0 }, future);
    expect(report.failures[0]?.reason).toContain('newer code');
  });
});
