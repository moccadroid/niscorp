import { describe, it, expect } from 'vitest';
import { at, lastOf } from './helpers/at';
import { z } from 'zod';
import { createStream } from '../src/create-stream';
import { simulateStream, generateLargePayload } from './helpers/simulate-stream';

// ═══════════════════════════════════════════════════════════
// Performance benchmarks
//
// These measure wall-clock time for streaming different payload sizes
// through different chunk strategies. They establish a baseline and
// reveal the O(n²) characteristic of JSON.parse per-write.
// ═══════════════════════════════════════════════════════════

const LargeSchema = z.object({
  status: z.string(),
  count: z.number(),
  items: z.array(z.object({
    id: z.number(),
    content: z.string(),
    value: z.number(),
  })),
});

type LargeResponse = z.infer<typeof LargeSchema>;

const INITIAL: LargeResponse = { status: '', count: 0, items: [] };

type BenchResult = {
  sizeKb: number;
  chunks: number;
  totalMs: number;
  msPerChunk: number;
  msPerKb: number;
};

const bench = (sizeKb: number, chunkSize: number): BenchResult => {
  const json = generateLargePayload(sizeKb);
  const stream = createStream({ schema: LargeSchema, initial: INITIAL });

  const start = performance.now();
  const chunks = simulateStream(stream, json, { mode: 'fixed', chunkSize });
  const totalMs = performance.now() - start;

  // Verify correctness
  const expected = JSON.parse(json);
  const current = stream.current();
  if (current.items.length !== expected.items.length) {
    throw new Error(`Item count mismatch: ${current.items.length} vs ${expected.items.length}`);
  }

  return {
    sizeKb,
    chunks: chunks.length,
    totalMs: Math.round(totalMs * 100) / 100,
    msPerChunk: Math.round((totalMs / chunks.length) * 1000) / 1000,
    msPerKb: Math.round((totalMs / sizeKb) * 100) / 100,
  };
};

describe('perf — payload size scaling', () => {
  // Fixed chunk size, varying payload — reveals O(n²) characteristic
  const CHUNK_SIZE = 50;

  it('1 KB payload', () => {
    const result = bench(1, CHUNK_SIZE);
    console.log(`  1 KB: ${result.totalMs}ms (${result.chunks} chunks, ${result.msPerKb}ms/KB)`);
    expect(result.totalMs).toBeLessThan(500);
  });

  it('5 KB payload', () => {
    const result = bench(5, CHUNK_SIZE);
    console.log(`  5 KB: ${result.totalMs}ms (${result.chunks} chunks, ${result.msPerKb}ms/KB)`);
    expect(result.totalMs).toBeLessThan(2000);
  });

  it('10 KB payload', () => {
    const result = bench(10, CHUNK_SIZE);
    console.log(`  10 KB: ${result.totalMs}ms (${result.chunks} chunks, ${result.msPerKb}ms/KB)`);
    expect(result.totalMs).toBeLessThan(5000);
  });

  it('25 KB payload', () => {
    const result = bench(25, CHUNK_SIZE);
    console.log(`  25 KB: ${result.totalMs}ms (${result.chunks} chunks, ${result.msPerKb}ms/KB)`);
    expect(result.totalMs).toBeLessThan(15000);
  });
});

describe('perf — chunk size impact', () => {
  // Fixed payload, varying chunk size — larger chunks = fewer writes = faster
  const SIZE_KB = 10;

  it('char-by-char (1 byte chunks)', () => {
    const result = bench(SIZE_KB, 1);
    console.log(`  10 KB / 1B chunks: ${result.totalMs}ms (${result.chunks} chunks)`);
    expect(result.totalMs).toBeLessThan(30000);
  });

  it('small chunks (10 bytes)', () => {
    const result = bench(SIZE_KB, 10);
    console.log(`  10 KB / 10B chunks: ${result.totalMs}ms (${result.chunks} chunks)`);
    expect(result.totalMs).toBeLessThan(10000);
  });

  it('medium chunks (100 bytes)', () => {
    const result = bench(SIZE_KB, 100);
    console.log(`  10 KB / 100B chunks: ${result.totalMs}ms (${result.chunks} chunks)`);
    expect(result.totalMs).toBeLessThan(3000);
  });

  it('large chunks (500 bytes)', () => {
    const result = bench(SIZE_KB, 500);
    console.log(`  10 KB / 500B chunks: ${result.totalMs}ms (${result.chunks} chunks)`);
    expect(result.totalMs).toBeLessThan(1000);
  });

  it('very large chunks (2000 bytes)', () => {
    const result = bench(SIZE_KB, 2000);
    console.log(`  10 KB / 2KB chunks: ${result.totalMs}ms (${result.chunks} chunks)`);
    expect(result.totalMs).toBeLessThan(500);
  });
});

describe('perf — O(n²) analysis', () => {
  it('prints scaling table for analysis', () => {
    const CHUNK_SIZE = 50;
    const sizes = [1, 2, 5, 10, 20];
    const results = sizes.map(size => bench(size, CHUNK_SIZE));

    console.log('\n  Payload scaling (50B chunks):');
    console.log('  Size(KB) | Chunks | Total(ms) | ms/KB | ms/chunk');
    console.log('  ---------|--------|-----------|-------|--------');
    for (const r of results) {
      console.log(`  ${String(r.sizeKb).padStart(7)}  | ${String(r.chunks).padStart(6)} | ${String(r.totalMs).padStart(9)} | ${String(r.msPerKb).padStart(5)} | ${String(r.msPerChunk).padStart(7)}`);
    }

    // If O(n²), ms/KB should increase roughly linearly with size
    // If O(n), ms/KB should stay roughly constant
    const firstMsPerKb = at(results, 0).msPerKb;
    const lastMsPerKb = lastOf(results).msPerKb;
    const ratio = lastMsPerKb / firstMsPerKb;

    console.log(`\n  Scaling ratio (last/first ms/KB): ${Math.round(ratio * 10) / 10}x`);
    console.log(`  (1.0x = O(n) linear, >2x suggests O(n²) quadratic)`);

    // Just verify it completes — the scaling ratio is informational
    expect(lastOf(results).totalMs).toBeGreaterThan(0);
  });
});
