import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { Sequence } from '@niscorp/strata';
import { createServer } from '../src/server';
import { runIntake, type IntakeContext } from '../src/integrations';
import { createGrammarUpgrader } from '../src/grammar';

// ═══════════════════════════════════════════════════════════════
// Documents in the grammar this code speaks — with a REAL migration: a Prism
// config, evaluated by the same engine that runs endpoints. The app's kit
// renamed Button's `label` prop to `text`; its grammar says so once, and every
// stored or submitted nova document catches up wherever a Button sits.
// ═══════════════════════════════════════════════════════════════

const doc = { $ref: '$.document' };
const renameLabel = {
  $case: {
    branches: [
      {
        when: { $eq: [{ $get: { from: doc, path: ['component'], fallback: null } }, 'Button'] },
        then: {
          $merge: [
            { $omit: { from: doc, keys: ['props'] } },
            {
              props: {
                $merge: [
                  { $omit: { from: { $get: { from: doc, path: ['props'], fallback: { $const: {} } } }, keys: ['label'] } },
                  { text: { $get: { from: doc, path: ['props', 'label'], fallback: null } }, __optional: ['text'] },
                ],
              },
            },
          ],
        },
      },
    ],
    else: doc,
  },
};

const kit: Sequence = {
  id: 'acme.kit',
  migrations: [{ description: 'Button: label → text', steps: [{ kind: 'document', at: 'nisc.nova/layout', transform: renameLabel }] }],
};

const oldAction = {
  id: 'acme.list',
  layout: {
    component: 'Stack',
    children: [
      { component: 'Button', props: { label: 'Add' } },
      { if: '$.admin', then: { component: 'Button', props: { label: 'Delete' } } },
    ],
  },
};

// "Stamped current" means: this code's grammars, whatever their versions are
// now — nova's and Prism's move on their own. What the test controls, it pins.
const currentStamp = async (): Promise<Record<string, number>> => {
  const stamp = { ...(await createGrammarUpgrader({ grammars: [kit] })).stamp };
  expect(stamp['acme.kit']).toBe(1);
  return stamp;
};

const quietly = <T>(run: () => Promise<T>): Promise<T> => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return run().finally(() => warn.mockRestore());
};

// A database as a deployment had it: moss's tables, one approved integration,
// and one stored action written before the kit's rename, at `stamp`.
const deploymentWith = async (stamp: Record<string, number>) => {
  const pool = createPglitePool(new PGlite());
  await quietly(() => createServer({ charter: {}, actions: {} }, { pool, db: pool, session: 'dev-open' }));
  await pool.query(`INSERT INTO integrations (id, url, status) VALUES ('acme', 'https://acme.example', 'approved')`);
  await pool.query(`INSERT INTO integration_actions (integration_id, action_id, definition, grammar) VALUES ('acme', 'acme.list', $1::jsonb, $2::jsonb)`, [
    JSON.stringify(oldAction),
    JSON.stringify(stamp),
  ]);
  return pool;
};

describe('stored documents — upgraded at boot', () => {
  it('a row written before the rename is rewritten at every depth and stamped current', async () => {
    const pool = await deploymentWith({ 'nisc.nova': 0, 'nisc.prism': 0 });
    await quietly(() => createServer({ charter: {}, actions: {}, grammars: [kit] }, { pool, db: pool, session: 'dev-open' }));
    const { rows } = await pool.query(`SELECT definition, grammar FROM integration_actions`);
    const stored = JSON.stringify(rows[0]?.['definition']);
    expect(stored).toContain('"text":"Add"');
    expect(stored).toContain('"text":"Delete"');
    expect(stored).not.toContain('"label"');
    expect(rows[0]?.['grammar']).toEqual(await currentStamp());
  });

  it('a row from before stamps (`{}`) is read as the start of every grammar', async () => {
    const pool = await deploymentWith({});
    await quietly(() => createServer({ charter: {}, actions: {}, grammars: [kit] }, { pool, db: pool, session: 'dev-open' }));
    const { rows } = await pool.query(`SELECT grammar FROM integration_actions`);
    expect(rows[0]?.['grammar']).toEqual(await currentStamp());
  });

  it('a row written by newer code refuses the boot — TOO_NEW, and the row is left as it was', async () => {
    const pool = await deploymentWith({ 'acme.kit': 4 });
    const error = await quietly(() => createServer({ charter: {}, actions: {}, grammars: [kit] }, { pool, db: pool, session: 'dev-open' })).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TOO_NEW' });
    const { rows } = await pool.query(`SELECT grammar FROM integration_actions`);
    expect(rows[0]?.['grammar']).toEqual({ 'acme.kit': 4 });
  });
});

describe('submitted documents — upgraded at intake', () => {
  const ctx = async (): Promise<IntakeContext> => ({
    integrationId: 'acme',
    components: new Map<string, { propsSchema?: unknown }>([
      ['Stack', {}],
      ['Button', {}],
    ]),
    fingerprints: new Set<string>(),
    attachable: new Set<string>(),
    menuSlots: new Set<string>(),
    upgrader: await createGrammarUpgrader({ grammars: [kit] }),
  });

  it('an add-on built before the rename submits `label`; the host stores `text`', async () => {
    const result = runIntake({ integration: 'acme', actions: { 'ext.member.acme.list': { ...oldAction, id: 'ext.member.acme.list' } }, grammar: { 'nisc.nova': 0 } }, await ctx());
    if (!result.ok) throw new Error(result.reasons.join(' | '));
    expect(JSON.stringify(result.bundle.actions)).toContain('"text":"Add"');
    expect(result.bundle.grammar).toEqual(await currentStamp());
  });

  it('an add-on built on newer grammars than the host is refused with the reason', async () => {
    const result = runIntake({ integration: 'acme', actions: { 'ext.member.acme.list': { ...oldAction, id: 'ext.member.acme.list' } }, grammar: { 'acme.kit': 9 } }, await ctx());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('host must be updated first');
    expect(result.reasons.join(' ')).toContain('acme.kit: the document is at 9, this code knows 1');
  });
});
