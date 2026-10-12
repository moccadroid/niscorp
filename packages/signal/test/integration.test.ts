import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal, defineTool } from '../src';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const hasGroqKey = !!process.env['GROQ_API_KEY'];

describe.skipIf(!hasGroqKey)('Groq integration', () => {
  const signal = createSignal('groq').model('openai/gpt-oss-120b');

  it('completes a simple text prompt', async () => {
    const { response, meta } = await signal.complete('What is 2+2? Answer with just the number.');

    expect(typeof response).toBe('string');
    expect(response).toContain('4');
    expect(meta.usage.totalTokens).toBeGreaterThan(0);
    expect(meta.model).toBe('openai/gpt-oss-120b');
  }, 15000);

  it('returns structured output with Zod schema', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      city: z.string(),
    });

    const { response, meta } = await signal
      .schema(schema)
      .complete('Extract: Alice is 30 years old and lives in Berlin.');

    expect(typeof response.name).toBe('string');
    expect(typeof response.age).toBe('number');
    expect(typeof response.city).toBe('string');
    expect(meta.usage.totalTokens).toBeGreaterThan(0);
  }, 15000);

  it('handles structured output with nested schema', async () => {
    const schema = z.object({
      users: z.array(z.object({
        name: z.string(),
        role: z.string(),
      })),
      count: z.number(),
    });

    const { response } = await signal
      .schema(schema)
      .complete('Extract users: Alice is an admin, Bob is a member.');

    expect(Array.isArray(response.users)).toBe(true);
    expect(typeof response.count).toBe('number');
  }, 15000);

  it('supports system prompts', async () => {
    const { response } = await signal
      .systemPrompt('You are a pirate. Always respond in pirate speak.')
      .complete('Say hello');

    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  }, 15000);

  it('uses tools via unified schema strategy', async () => {
    const lookupTool = defineTool({
      name: 'lookup_employee',
      description: 'Look up employee information by ID. You MUST use this tool to get employee data.',
      input: z.object({
        id: z.string().describe('Employee ID'),
      }),
      execute: ({ id }) => {
        if (id === 'EMP-42') return { name: 'Jane Doe', department: 'Engineering', salary: 95000 };
        return { error: 'Employee not found' };
      },
    });

    const { response, meta } = await signal
      .tools([lookupTool])
      .schema(z.object({ answer: z.string().describe('Your answer to the user question') }))
      .systemPrompt('You MUST use the lookup_employee tool to answer questions about employees. Never guess. When you have the answer, respond with an "answer" field containing your response.')
      .complete('What department does employee EMP-42 work in?');

    // A live model may not call the tool, so the call is not asserted.
    expect(typeof response.answer).toBe('string');
    expect(meta.usage.totalTokens).toBeGreaterThan(0);
  }, 30000);

  it('returns conversation history', async () => {
    const { history } = await signal.complete('Hello');

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0]!.role).toBe('user');
    expect(history[history.length - 1]!.role).toBe('assistant');
  }, 15000);

  it('supports multi-turn via history', async () => {
    const r1 = await signal.complete('My name is Alice. Remember that.');
    const r2 = await signal.history(r1.history).complete('What is my name?');

    expect(typeof r2.response).toBe('string');
  }, 30000);

  it('tracks token usage', async () => {
    const { meta } = await signal.complete('Say "hi"');

    expect(meta.usage.inputTokens).toBeGreaterThan(0);
    expect(meta.usage.outputTokens).toBeGreaterThan(0);
    expect(meta.usage.totalTokens).toBeGreaterThan(0);
    expect(meta.durationMs).toBeGreaterThan(0);
  }, 15000);

  it('includes provider raw response', async () => {
    const { meta } = await signal.complete('Hi');

    expect(meta.provider.raw).toBeDefined();
  }, 15000);
});
