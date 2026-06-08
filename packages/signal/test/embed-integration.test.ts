import { describe, it, expect } from 'vitest';
import { createSignal } from '../src';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const hasOpenAIKey = !!process.env['OPENAI_API_KEY'];

describe.skipIf(!hasOpenAIKey)('OpenAI embedding integration', () => {
  const embedder = createSignal('openai').model('text-embedding-3-small');

  it('embeds a single string', async () => {
    const vector = await embedder.embed('wireless headphones');

    expect(Array.isArray(vector)).toBe(true);
    expect(vector.length).toBeGreaterThan(0);
    expect(typeof vector[0]).toBe('number');
  }, 15000);

  it('embeds a batch of strings', async () => {
    const vectors = await embedder.embed([
      'wireless headphones',
      'running shoes',
      'coffee machine',
    ]);

    expect(Array.isArray(vectors)).toBe(true);
    expect(vectors.length).toBe(3);
    for (const vec of vectors) {
      expect(Array.isArray(vec)).toBe(true);
      expect(vec.length).toBeGreaterThan(0);
    }
  }, 15000);

  it('respects dimensions option', async () => {
    const full = await embedder.embed('test input');
    const small = await embedder.embed('test input', { dimensions: 256 });

    expect(full.length).toBeGreaterThan(256);
    expect(small.length).toBe(256);
  }, 15000);

  it('similar texts produce similar vectors', async () => {
    const [a, b, c] = await embedder.embed([
      'comfortable running shoes for marathon',
      'athletic footwear for long distance running',
      'industrial hydraulic pump repair manual',
    ]);

    const cosine = (x: number[], y: number[]): number => {
      let dot = 0, magX = 0, magY = 0;
      for (let i = 0; i < x.length; i++) {
        dot += x[i]! * y[i]!;
        magX += x[i]! * x[i]!;
        magY += y[i]! * y[i]!;
      }
      return dot / (Math.sqrt(magX) * Math.sqrt(magY));
    };

    const similarScore = cosine(a!, b!);
    const dissimilarScore = cosine(a!, c!);

    expect(similarScore).toBeGreaterThan(dissimilarScore);
    expect(similarScore).toBeGreaterThan(0.5);
  }, 15000);
});
