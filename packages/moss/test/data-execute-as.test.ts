import { describe, it, expect, vi } from 'vitest';
import { createScopePolicy } from '@niscorp/vex';
import type { ExecuteRecord, ScopePolicy } from '@niscorp/vex';
import { createExecuteAs } from '../src/data/policy';
import { engineDouble } from './data-double';

// A SEEDED ENTRY, RUN AS A CHARTER ROLE. The engine has no database behind it
// (./data-double.ts): these hold what executeAs hands vex and what it answers.

const POLICIES: Readonly<Record<string, ScopePolicy>> = {
  reader: createScopePolicy(new Set(['notes.read'])),
  writer: createScopePolicy(new Set(['notes.read', 'notes.write.insert'])),
};
const NOTHING = createScopePolicy(new Set());

const world = async () => {
  const double = await engineDouble();
  const asked: { roles: readonly string[]; reach?: string }[] = [];
  const records: ExecuteRecord[] = [];
  const executeAs = createExecuteAs({
    engine: double.engine,
    db: double.db,
    policyFor: (roles) => {
      asked.push({ roles });
      return POLICIES[roles[0] ?? ''] ?? NOTHING;
    },
    policyAtReach: (roles, reach) => {
      asked.push({ roles, reach });
      return POLICIES[roles[0] ?? ''] ?? NOTHING;
    },
    onExecute: (record) => records.push(record),
  });
  return { ...double, executeAs, asked, records };
};

// A refusal is logged; these tests read the line and keep it off the output.
const logged = async <T>(run: () => Promise<T>): Promise<{ answer: T; lines: string[] }> => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const answer = await run();
    return { answer, lines: error.mock.calls.map((call) => String(call[0])) };
  } finally {
    error.mockRestore();
  }
};

describe('executeAs — a seeded entry as a charter role', () => {
  it('answers what a seeded read returns, under the policy of the one role named', async () => {
    const { executeAs, asked } = await world();
    expect(await executeAs('reader', 'notes/all', {})).toEqual([{ id: 1, body: 'first' }]);
    expect(asked.every((ask) => ask.roles.length === 1 && ask.roles[0] === 'reader')).toBe(true);
  });

  it('asks for the role\'s policy once for a call, whether it reads or writes', async () => {
    const { executeAs, asked } = await world();
    await executeAs('reader', 'notes/all', {});
    expect(asked).toEqual([{ roles: ['reader'] }]);
    asked.length = 0;
    await executeAs('writer', 'notes/add', { body: 'hello' });
    expect(asked).toEqual([{ roles: ['writer'] }]);
  });

  it('replays a seeded write on the client it was handed, with the context it was given', async () => {
    const { executeAs, written } = await world();
    expect(await executeAs('writer', 'notes/add', { body: 'hello' })).toEqual({ id: 7, body: 'written' });
    expect(written).toHaveLength(1);
    expect(written[0]?.sql).toMatch(/^INSERT INTO/);
    expect(written[0]?.params).toContain('hello');
  });

  it('a role with no grant for the entry is refused: nothing is answered, and it is logged', async () => {
    const { executeAs, written } = await world();
    const read = await logged(() => executeAs('nobody', 'notes/all', {}));
    expect(read.answer).toBeUndefined();
    expect(read.lines.some((line) => line.includes('"notes/all" as "nobody" refused'))).toBe(true);
    const write = await logged(() => executeAs('reader', 'notes/add', { body: 'hello' }));
    expect(write.answer).toBeUndefined();
    expect(written).toHaveLength(0);
  });

  it('runs seeded entries only', async () => {
    const { executeAs, read } = await world();
    const unseeded = await logged(() => executeAs('reader', 'notes/never-seeded', {}));
    expect(unseeded.answer).toBeUndefined();
    expect(unseeded.lines.some((line) => line.includes('"notes/never-seeded" as "reader" refused'))).toBe(true);
    expect(read).toHaveLength(0);
  });

  it('an entry that demands a reach is served at that reach, for the same role', async () => {
    const { executeAs, asked } = await world();
    expect(await executeAs('reader', 'notes/mine', {})).toEqual([{ id: 1, body: 'first' }]);
    expect(asked).toContainEqual({ roles: ['reader'], reach: 'personal' });
  });

  it('reports each execution with the scope the caller supplied, and no principal in it', async () => {
    const { executeAs, records } = await world();
    await executeAs('reader', 'notes/all', {}, { studioId: 'st_1' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'query', status: 'ok', fingerprint: 'notes/all', scope: { studioId: 'st_1' } });
  });
});
