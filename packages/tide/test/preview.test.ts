import { describe, it, expect } from 'vitest';
import { createMemoryStore, createTide } from '../src/index';
import type { EffectRegistry, ReflexInput, Row, Tide } from '../src/index';
import { testTransform, utc } from './support';

// Preview is a VERB, not a flag. The real pipeline runs — the occurrence is
// computed, the selection hits real data, every template is evaluated — and
// exactly one function is stubbed. Because that function is the only door
// out of tide, a reflex cannot opt out of being previewable.

const vienna = 'Europe/Vienna';
const NOW = utc('2026-03-10T12:00:00Z');

const members: Row[] = [
  { member_id: 'm1', name: 'Ada', email: 'ada@example.com' },
  { member_id: 'm2', name: 'Grace', email: 'grace@example.com' },
];

const dunning: ReflexInput = {
  id: 'billing.dunning',
  intent: 'Email members whose payment failed.',
  on: { clock: { every: 'day', at: '09:00', tz: vienna } },
  select: { query: { fingerprint: 'members/overdue' }, mode: 'each', unitKey: 'member_id' },
  effect: {
    name: 'mail.send',
    input: { to: { $ref: '$.row.email' }, name: { $ref: '$.row.name' }, day: { $ref: '$.occurrence.key' } },
  },
};

const build = async (effects: EffectRegistry, rows: readonly Row[] = members): Promise<{ tide: Tide; sent: unknown[] }> => {
  const sent: unknown[] = [];
  const traced: EffectRegistry = Object.fromEntries(
    Object.entries(effects).map(([name, handler]) => [
      name,
      { ...handler, run: (input: unknown, ctx: Parameters<typeof handler.run>[1]) => { sent.push(input); return handler.run(input, ctx); } },
    ]),
  );
  const tide = createTide({
    store: createMemoryStore(),
    transform: testTransform,
    effects: traced,
    select: () => rows,
  });
  await tide.load([dunning], { at: NOW - 86_400_000 });
  return { tide, sent };
};

describe('preview', () => {
  it('shows the members by name, and sends nothing', async () => {
    const { tide, sent } = await build({ 'mail.send': { run: () => ({ ok: true }) } });
    const report = await tide.preview('billing.dunning', { now: NOW });

    expect(report.fired).toBe(true);
    expect(report.selected).toBe(2);
    expect(report.units.map((unit) => unit.unit)).toEqual(['m1', 'm2']);
    expect(report.units[0]?.input).toEqual({ to: 'ada@example.com', name: 'Ada', day: '2026-03-10' });

    // The whole point: no effect ran…
    expect(sent).toHaveLength(0);
    // …and nothing was written to the ledger either.
    expect(await tide.ledger.runs()).toHaveLength(0);
    expect(await tide.ledger.tasks()).toHaveLength(0);
  });

  it('renders the effect handler own preview hook when it has one', async () => {
    const { tide } = await build({
      'mail.send': {
        run: () => ({ ok: true }),
        preview: (input) => ({ channel: 'email', to: (input as { to: string }).to }),
      },
    });
    const report = await tide.preview('billing.dunning', { now: NOW });
    expect(report.units[0]?.render).toEqual({ channel: 'email', to: 'ada@example.com' });
  });

  it('reports the version it would run under', async () => {
    const { tide } = await build({ 'mail.send': { run: () => null } });
    const report = await tide.preview('billing.dunning', { now: NOW });
    expect(report.version).toMatch(/^v_/);
    expect(report.cause).toBe('occurrence:2026-03-10');
  });

  it('surfaces a template typo instead of hiding it until 3am', async () => {
    const broken: ReflexInput = { ...dunning, id: 'broken', effect: { name: 'mail.send', input: { to: { $throw: 'no such field' } } } };
    const tide = createTide({
      store: createMemoryStore(),
      transform: testTransform,
      effects: { 'mail.send': { run: () => null } },
      select: () => members,
    });
    await tide.load([broken], { at: NOW - 86_400_000 });
    const report = await tide.preview('broken', { now: NOW });
    expect(report.units[0]?.error).toContain('no such field');
  });

  it('says so when a `when` would not have matched', async () => {
    const gated: ReflexInput = {
      id: 'gated',
      intent: 'Only paid invoices.',
      on: { fact: { entity: 'invoices' } },
      when: { $eq: [{ $ref: '$.fact.row.status' }, 'paid'] },
      effect: { name: 'mail.send' },
    };
    const tide = createTide({
      store: createMemoryStore(),
      transform: testTransform,
      effects: { 'mail.send': { run: () => null } },
    });
    await tide.load([gated], { at: 0 });

    const missed = await tide.preview('gated', { now: NOW, fact: { kind: 'write', entity: 'invoices', row: { status: 'draft' }, at: NOW } });
    expect(missed.fired).toBe(false);
    expect(missed.reason).toContain('did not match');

    const hit = await tide.preview('gated', { now: NOW, fact: { kind: 'write', entity: 'invoices', row: { status: 'paid' }, at: NOW } });
    expect(hit.fired).toBe(true);
  });

  it('previews a reflex that is disarmed — that is what preview is for', async () => {
    const { tide } = await build({ 'mail.send': { run: () => null } });
    // Disarming is the host writing its own column and loading again, not a
    // method on the engine. Preview does not consult the switch either way:
    // looking before arming is most of what the verb is for.
    await tide.load([{ ...dunning, enabled: false }], { at: NOW - 86_400_000 });
    const report = await tide.preview('billing.dunning', { now: NOW });
    expect(report.selected).toBe(2);
  });
});
