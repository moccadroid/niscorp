import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal, defineTool } from '../src';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const hasOpenAIKey = !!process.env['OPENAI_API_KEY'];

const weather = defineTool({
  name: 'weather',
  description: 'The current weather in a city.',
  input: z.object({ city: z.string() }),
  execute: ({ city }) => ({ city, sky: 'sunny', celsius: 21 }),
});

describe.skipIf(!hasOpenAIKey)('OpenAI Responses integration', () => {
  const signal = createSignal('openai-responses');

  it('completes a text prompt', async () => {
    const { response, meta } = await signal.complete('What is 2+2? Answer with just the number.');
    expect(response).toContain('4');
    expect(meta.usage.totalTokens).toBeGreaterThan(0);
  }, 30000);

  it('runs a tool and answers from its result', async () => {
    const { response, meta } = await signal.tools([weather]).complete('What is the weather in Vienna? Use the tool.');
    expect(meta.toolCalls.map((call) => call.name)).toContain('weather');
    expect(response).toMatch(/21/);
  }, 30000);

  it('returns output that fits a schema', async () => {
    const { response } = await signal
      .schema(z.object({ name: z.string(), age: z.number() }))
      .complete('Extract: Alice is 30 years old.');
    expect(response).toEqual({ name: 'Alice', age: 30 });
  }, 30000);

  it('runs a tool on a reasoning model with no reasoning carried between turns', async () => {
    const { response, meta } = await signal
      .model('gpt-5.4-mini')
      .options({ reasoningEffort: 'low' })
      .tools([weather])
      .complete('What is the weather in Vienna? Use the tool.');
    expect(meta.toolCalls.map((call) => call.name)).toContain('weather');
    expect(response).toMatch(/21/);
  }, 60000);

  it('embeds through the embeddings endpoint', async () => {
    const vector = await signal.model('text-embedding-3-small').embed('wireless headphones');
    expect(vector.length).toBeGreaterThan(0);
  }, 15000);

  it('reaches a model the chat completions endpoint does not serve', async () => {
    const { response } = await signal.model('gpt-5.3-codex').complete('Reply with the word yes.');
    expect(response.toLowerCase()).toContain('yes');
  }, 60000);
});
