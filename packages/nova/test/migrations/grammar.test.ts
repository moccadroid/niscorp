import { describe, expect, it } from 'vitest';
import { createUpgrader } from '@niscorp/strata';
import { evaluate } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import { NOVA_SCHEMAS, NOVA_SEQUENCE } from '../../src/migrations';

// ═══════════════════════════════════════════════════════════
// nova's own grammar, through strata — the real sequence, not a stand-in.
// strata tests TOO_NEW with sequences it makes up; this is the promise for the
// documents nova actually defines: a reader refuses an action written by newer
// nova, and upgrades one written by older nova. Each version's reader is built
// by cutting the sequence back to that version, which is exactly the code an
// older host runs.
// ═══════════════════════════════════════════════════════════

const readerAt = (version: number) =>
  createUpgrader([{ ...NOVA_SEQUENCE, migrations: NOVA_SEQUENCE.migrations.slice(0, version) }, PRISM_SEQUENCE], { transform: evaluate });

const current = NOVA_SEQUENCE.migrations.length;

// An action that uses the reconcile step (nisc.nova/1).
const reconciling = {
  id: 'deck',
  data: { tools: [] },
  triggers: [{ message: 'deck-moved', do: [{ reconcile: { canvas: 'tools', to: '$.tools', action: 'tool_id', own: 'canvas' } }] }],
};

// An action any nova since 0 could have written.
const plain = { id: 'counter', data: { n: 0 }, triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }] };

describe('nisc.nova — the grammar a stamp names', () => {
  it('a writer today stamps the current version', async () => {
    expect((await readerAt(current)).stamp['nisc.nova']).toBe(current);
  });

  it('a reader at 0 refuses an action that uses reconcile — TOO_NEW, never guessed at', async () => {
    const stamp = (await readerAt(current)).stamp;
    const old = await readerAt(0);
    expect(() => old.upgrade(reconciling, { kind: 'nisc.nova/action', stamp })).toThrow(expect.objectContaining({ code: 'TOO_NEW' }));
  });

  it('every reader one version behind refuses what the next version wrote', async () => {
    for (let version = 1; version <= current; version += 1) {
      const stamp = { ...(await readerAt(version)).stamp };
      const behind = await readerAt(version - 1);
      expect(() => behind.upgrade(plain, { kind: 'nisc.nova/action', stamp }), `a reader at ${version - 1}`).toThrow(expect.objectContaining({ code: 'TOO_NEW' }));
    }
  });

  it('the current reader takes an action stamped today as it is, and it parses', async () => {
    const reader = await readerAt(current);
    const { document, applied } = reader.upgrade(reconciling, { kind: 'nisc.nova/action', stamp: reader.stamp });
    expect(applied).toEqual([]);
    expect(NOVA_SCHEMAS['nisc.nova/action'].safeParse(document).success).toBe(true);
  });

  it('an action written at 0 upgrades through every migration since, and still parses', async () => {
    const reader = await readerAt(current);
    const { document, applied } = reader.upgrade(plain, { kind: 'nisc.nova/action', stamp: { 'nisc.nova': 0, 'nisc.prism': reader.stamp['nisc.prism'] ?? 0 } });
    expect(applied).toEqual(NOVA_SEQUENCE.migrations.map((_, index) => `nisc.nova/${index + 1}`));
    expect(NOVA_SCHEMAS['nisc.nova/action'].safeParse(document).success).toBe(true);
  });
});
