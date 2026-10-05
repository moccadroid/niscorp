import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex } from '../../src/utils/sha256.js';
import { canonicalHash } from '../../src/utils/canonical.js';
import { computePolicyKey, computeRequestHash, computeSchemaFingerprint, mintFingerprint } from '../../src/cache/hash.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';

// Vex hashes without `node:crypto`, so that it runs in a page. Two things are
// held here: its SHA-256 answers what node's answers, and the values vex
// stores — which caches already hold — are the ones it stored before.

const nodeSha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('sha256Hex', () => {
  it('answers the published vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('answers what node answers at every length around a block', () => {
    // 55, 56, 63, 64 and 65 bytes are where the padding changes shape
    for (let length = 0; length <= 200; length += 1) {
      const text = 'a'.repeat(length);
      expect(sha256Hex(text), `length ${length}`).toBe(nodeSha256(text));
    }
  });

  it('answers what node answers for text in any script, well formed or not', () => {
    const samples = ['héllo — ∑ 日本語 🎭', '\ud83d', '\udc00x', 'é'.repeat(2_000_000)];
    for (let n = 0; n < 2000; n += 1) {
      samples.push(Array.from({ length: n % 300 }, (_unused, i) => String.fromCodePoint(32 + ((n * 7919 + i * 104729) % 70000))).join(''));
    }
    const differing = samples.filter((sample) => sha256Hex(sample) !== nodeSha256(sample));
    expect(differing).toHaveLength(0);
  });
});

describe('the hashes vex stores', () => {
  // Captured from the build that hashed with node's `createHash`. A cache
  // row's `request_hash` and `schema_fingerprint` are compared against what
  // is computed now, so a value that moved would read every stored entry as
  // changed, or as stale.
  it('a request hash is what it was', () => {
    const request = { intent: 'List open todos ordered by due date', shape: [{ todo_id: '', title: '', due_display: '' }], context: { ownerId: 'u1' } };
    expect(computeRequestHash(request)).toBe('2e79645eaf4312d72cc3ac819860bfa0a4ac82cb7424b87e585027b8409fae3a');
  });

  it('a schema fingerprint is what it was', () => {
    const schema: DatabaseSchema = {
      entities: [
        {
          name: 'todos',
          table: 'todos',
          rowCount: 12,
          description: 'things to do',
          fields: [
            { name: 'title', type: 'text', normalizedType: 'string', nullable: false, primaryKey: false },
            { name: 'id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: true },
            { name: 'owner_id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: false },
          ],
          relations: [{ type: 'belongsTo', entity: 'owners', localFields: ['owner_id'], foreignFields: ['id'] }],
          indexes: [{ name: 'todos_pkey', fields: ['id'], unique: true, type: 'btree' }],
        },
        { name: 'owners', table: 'owners', fields: [{ name: 'id', type: 'uuid', normalizedType: 'string', nullable: false, primaryKey: true }], relations: [], indexes: [] },
      ],
    };
    expect(computeSchemaFingerprint(schema)).toBe('70d3d59f54aeae5a2b8e4b61d79461558ad0437de13ae80dce6d3f9b3bef079e');
  });

  it('a policy key and a canonical hash are node’s hash of the same text', () => {
    expect(computePolicyKey({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(nodeSha256('{"a":[2,{"c":2,"d":1}],"b":1}').slice(0, 16));
    expect(computePolicyKey(undefined)).toBe('none');
    expect(canonicalHash({ b: 1, a: 2 })).toBe(nodeSha256('{"a":2,"b":1}'));
  });

  it('a minted fingerprint keeps its form', () => {
    expect(mintFingerprint()).toMatch(/^fp_[0-9a-f]{16}$/);
    expect(mintFingerprint()).not.toBe(mintFingerprint());
  });
});
