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

  it('a FIELD named description is grammar — only the keyword is prose', () => {
    const titled = z.object({ title: z.string() }).strict();
    const described = z.object({ title: z.string(), description: z.string().optional() }).strict();
    const retyped = z.object({ title: z.string(), description: z.number().optional() }).strict();
    const added = compareSnapshot(snapshotOf(forms(), { 'acme.forms/form': titled }), snapshotOf(forms(), { 'acme.forms/form': described }));
    expect(added.status === 'changed' && added.changes[0]?.lines).toEqual(['+ properties.description']);
    const changed = compareSnapshot(snapshotOf(forms(), { 'acme.forms/form': described }), snapshotOf(forms(), { 'acme.forms/form': retyped }));
    expect(changed.status === 'changed' && changed.changes[0]?.lines).toEqual(['~ properties.description.type: "string" → "number"']);
  });

  it('a FIELD named $ref is grammar — only the keyword is a reference', () => {
    const op = (pattern: string) => z.object({ $ref: z.string().regex(new RegExp(pattern)) }).strict();
    const result = compareSnapshot(snapshotOf(forms(), { 'acme.forms/form': op('^\\$') }), snapshotOf(forms(), { 'acme.forms/form': op('^#') }));
    expect(result.status).toBe('changed');
  });

  it('the record keeps what the validator wrote — the prose too', () => {
    expect(JSON.stringify(snapshotOf(forms(), { 'acme.forms/form': formV0 }).kinds)).toContain('What the form is called.');
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

// A recursive grammar as one validator writes it: the node union behind a
// numbered definition, a described reference inlined beside its description,
// a union of bare types as `anyOf`, one non-recursive definition of its own.
const recursiveAsWritten = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  description: 'A node.',
  $ref: '#/$defs/__schema2',
  $defs: {
    __schema0: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
    __schema1: { type: 'object', properties: { $not: { $ref: '#/$defs/__schema2' } }, required: ['$not'], additionalProperties: false },
    __schema2: {
      description: 'A node: an op or a primitive.',
      anyOf: [
        { $ref: '#/$defs/__schema0' },
        { $ref: '#/$defs/__schema1' },
        { type: 'object', properties: { $add: { type: 'array', prefixItems: [{ $ref: '#/$defs/__schema2' }, { $ref: '#/$defs/__schema2' }] } }, required: ['$add'], additionalProperties: false },
      ],
    },
  },
};

// The same grammar as another version writes it: definitions renamed and
// inlined differently, a described root as `allOf: [{ $ref }]`, the primitive
// union as a type list in another order. `change` departs from it for real.
const respelled = (change: { primitives?: string[]; closeAdd?: boolean; addNeg?: boolean } = {}) => {
  const node = { $ref: '#/$defs/__schema0' };
  const op = (name: string, value: unknown) => ({ type: 'object', properties: { [name]: value }, required: [name], additionalProperties: false });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    description: 'A node.',
    allOf: [node],
    $defs: {
      __schema0: {
        description: 'A node: an op or a primitive.',
        anyOf: [
          { type: change.primitives ?? ['null', 'string', 'number'] },
          op('$not', { description: 'Negated.', ...node }),
          op('$add', { type: 'array', prefixItems: [node, node], ...(change.closeAdd === true ? { items: false } : {}) }),
          ...(change.addNeg === true ? [op('$neg', node)] : []),
        ],
      },
    },
  };
};

const snapshotWith = (schema: unknown) => ({ sequence: 'acme.nodes', version: 1, kinds: { 'acme.nodes/node': schema } });

describe('snapshot — a validator\'s spelling is not a change', () => {
  it('the same recursive grammar, written two ways, is the same', () => {
    expect(compareSnapshot(snapshotWith(recursiveAsWritten), snapshotWith(respelled()))).toEqual({ status: 'same' });
  });

  it('a change inside the recursive definition is still a change, and says where', () => {
    const result = compareSnapshot(snapshotWith(recursiveAsWritten), snapshotWith(respelled({ addNeg: true })));
    expect(result.status === 'changed' && result.changes[0]?.lines).toEqual(['+ $defs.d0.anyOf[$neg]']);
  });

  it('closing a tuple is a change — a description that admits more is not the same one', () => {
    const result = compareSnapshot(snapshotWith(recursiveAsWritten), snapshotWith(respelled({ closeAdd: true })));
    expect(result.status === 'changed' && result.changes[0]?.lines).toEqual(['+ $defs.d0.anyOf[$add].properties.$add.items']);
  });

  it('a primitive dropped from the union is a change', () => {
    expect(compareSnapshot(snapshotWith(recursiveAsWritten), snapshotWith(respelled({ primitives: ['string', 'number'] }))).status).toBe('changed');
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
