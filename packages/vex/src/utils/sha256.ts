// ═══════════════════════════════════════════════════════════════
// SHA-256 of a text's UTF-8 bytes, as lowercase hex — the hash behind every
// identity vex computes: request hashes, schema fingerprints, policy keys,
// and the row and answer hashes a reactive read compares.
//
// Written out (FIPS 180-4) rather than taken from `node:crypto`, because vex
// also runs in a page — PGlite in the browser, the client-degrade posture —
// where that module does not exist and a bundler refuses the import.
//
// SYNCHRONOUS, which is why it is not WebCrypto's `subtle.digest` (prism and
// strata hash there, where they already await): three exported functions
// answer with a hash directly, and a follower's `deliver` compares two inside
// a callback.
//
// The digests are node's, byte for byte, so nothing already stored under one
// moves — a request hash, a schema fingerprint, a negative-cache key.
// test/utils/sha256.test.ts holds the two to each other.
// ═══════════════════════════════════════════════════════════════

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const BLOCK_BYTES = 64;

const rotateRight = (word: number, bits: number): number => (word >>> bits) | (word << (32 - bits));

const wordHex = (word: number): string => (word >>> 0).toString(16).padStart(8, '0');

export const sha256Hex = (text: string): string => {
  const bytes = new TextEncoder().encode(text);

  // Whole blocks: the text, one 0x80 byte, zeros, then the text's length in
  // bits as a 64-bit big-endian number.
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / BLOCK_BYTES) * BLOCK_BYTES);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // A typed array keeps every word to 32 bits on write; reading one back is
  // `?? 0` only because an index is never proven in range to the compiler.
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    for (let i = 0; i < 16; i += 1) schedule[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const w15 = schedule[i - 15] ?? 0;
      const w2 = schedule[i - 2] ?? 0;
      const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      schedule[i] = (schedule[i - 16] ?? 0) + s0 + (schedule[i - 7] ?? 0) + s1;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + (ROUND_CONSTANTS[i] ?? 0) + (schedule[i] ?? 0)) | 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return wordHex(h0) + wordHex(h1) + wordHex(h2) + wordHex(h3) + wordHex(h4) + wordHex(h5) + wordHex(h6) + wordHex(h7);
};
