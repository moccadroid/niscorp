import type { Stream } from '../../src/types';

export type SimulateOptions = {
  mode: 'char' | 'token' | 'random' | 'fixed';
  chunkSize?: number;
  minChunk?: number;
  maxChunk?: number;
};

export const simulateStream = <T>(
  stream: Stream<T>,
  json: string,
  options: SimulateOptions = { mode: 'token' },
): string[] => {
  const chunks = splitIntoChunks(json, options);
  for (const chunk of chunks) {
    stream.write(chunk);
  }
  return chunks;
};

export const simulateAsyncStream = async <T>(
  stream: Stream<T>,
  json: string,
  options: SimulateOptions & { delayMs?: number } = { mode: 'token' },
): Promise<string[]> => {
  const chunks = splitIntoChunks(json, options);
  const delay = options.delayMs ?? 1;
  for (const chunk of chunks) {
    stream.write(chunk);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return chunks;
};

const splitIntoChunks = (json: string, options: SimulateOptions): string[] => {
  switch (options.mode) {
    case 'char':
      return json.split('');

    case 'token':
      return splitByTokenBoundaries(json);

    case 'fixed': {
      const size = options.chunkSize ?? 10;
      return splitBySize(json, size, size);
    }

    case 'random': {
      const min = options.minChunk ?? 1;
      const max = options.maxChunk ?? 20;
      return splitBySize(json, min, max);
    }
  }
};

const splitByTokenBoundaries = (json: string): string[] => {
  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    current += ch;

    const isStructural = ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',' || ch === ':';
    const isStringEnd = ch === '"' && i > 0 && json[i - 1] !== '\\';

    if (isStructural || isStringEnd) {
      chunks.push(current);
      current = '';
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
};

const splitBySize = (json: string, min: number, max: number): string[] => {
  const chunks: string[] = [];
  let pos = 0;
  let seed = 42;

  while (pos < json.length) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const size = min + (seed % (max - min + 1));
    chunks.push(json.slice(pos, pos + size));
    pos += size;
  }

  return chunks;
};

export const generatePayload = (options: {
  responseLength?: number;
  itemCount?: number;
}): string => {
  const responseLength = options.responseLength ?? 200;
  const itemCount = options.itemCount ?? 3;

  const response = 'x'.repeat(responseLength);
  const reasoning = 'This is the reasoning behind the response. '.repeat(3).trim();
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: i + 1,
    label: `Item ${i + 1}`,
    score: Math.round((0.5 + (i * 0.1)) * 100) / 100,
    tags: [`tag-${i}a`, `tag-${i}b`],
  }));

  return JSON.stringify({
    widget: { type: 'card', title: 'Analysis Result' },
    response,
    reasoning,
    items,
    meta: { model: 'test', temperature: 0.7, tokens: responseLength },
  });
};

export const generateLargePayload = (sizeKb: number): string => {
  const targetBytes = sizeKb * 1024;
  const items: { id: number; content: string; value: number }[] = [];
  let currentSize = 50;

  let id = 0;
  while (currentSize < targetBytes) {
    const content = `Item content for entry ${id}. ` + 'x'.repeat(80);
    items.push({ id, content, value: id * 1.1 });
    currentSize += content.length + 40;
    id++;
  }

  return JSON.stringify({
    status: 'complete',
    count: items.length,
    items,
  });
};
