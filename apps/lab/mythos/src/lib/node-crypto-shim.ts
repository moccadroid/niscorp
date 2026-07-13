import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// ═══════════════════════════════════════════════════════════
// Browser shim for the slice of `node:crypto` that @niscorp/vex
// uses. Vex's cache/hash.ts calls
// `createHash('sha256').update(str).digest('hex')` to compute its
// shape/request/schema hashes — a Node builtin absent in the
// browser. Vite aliases `node:crypto` (and bare `crypto`) to this
// module (see vite.config.ts).
//
// Backed by @noble/hashes, whose SHA-256 is byte-identical to
// Node's, so hashes computed here match those computed anywhere
// else. Anything beyond createHash('sha256') is intentionally
// unsupported and throws, so an unexpected new dependency on
// node:crypto surfaces loudly instead of silently misbehaving.
//
// Declared shim exception (STYLE_GUIDE / AGENTS rule 13): this file
// must match the external module's shape, so it carries a default
// export alongside the named one.
// ═══════════════════════════════════════════════════════════

type HashInput = string | Uint8Array;

type Sha256Hash = {
  update: (data: HashInput) => Sha256Hash;
  digest: (encoding: 'hex') => string;
};

const createSha256 = (): Sha256Hash => {
  const chunks: Uint8Array[] = [];
  const hash: Sha256Hash = {
    update: (data) => {
      chunks.push(typeof data === 'string' ? utf8ToBytes(data) : data);
      return hash;
    },
    digest: (encoding) => {
      if (encoding !== 'hex') {
        throw new Error(`node:crypto shim: only digest('hex') is supported, got '${encoding}'`);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const buf = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        buf.set(c, offset);
        offset += c.length;
      }
      return bytesToHex(sha256(buf));
    },
  };
  return hash;
};

export const createHash = (algorithm: string): Sha256Hash => {
  if (algorithm !== 'sha256') {
    throw new Error(`node:crypto shim: only 'sha256' is supported, got '${algorithm}'`);
  }
  return createSha256();
};

export default { createHash };
