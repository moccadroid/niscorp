import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { selectStructuredOutputStrategy } from '../src/strategy/structured-output';
import { selectToolCallingStrategy, toolsToProviderFormat } from '../src/strategy/tool-calling';
import { buildUnifiedJsonSchema, buildSystemPromptAddition } from '../src/strategy/unified-schema';
import { defineTool } from '../src';
import type { Capabilities } from '../src';

const groqCaps: Capabilities = { nativeTools: false, nativeJsonSchema: true, nativeJsonMode: true, multimodal: false };
const openaiCaps: Capabilities = { nativeTools: true, nativeJsonSchema: true, nativeJsonMode: true, multimodal: true };
const basicCaps: Capabilities = { nativeTools: false, nativeJsonSchema: false, nativeJsonMode: false, multimodal: false };

describe('selectStructuredOutputStrategy', () => {
  it('picks json_schema when supported', () => {
    expect(selectStructuredOutputStrategy(openaiCaps)).toBe('json_schema');
  });

  it('picks json_mode when json_schema not supported', () => {
    expect(selectStructuredOutputStrategy({ ...openaiCaps, nativeJsonSchema: false })).toBe('json_mode');
  });

  it('picks prompt_only when nothing supported', () => {
    expect(selectStructuredOutputStrategy(basicCaps)).toBe('prompt_only');
  });
});

describe('selectToolCallingStrategy', () => {
  it('picks native when supported', () => {
    expect(selectToolCallingStrategy(openaiCaps)).toBe('native');
  });

  it('picks unified_schema when not supported', () => {
    expect(selectToolCallingStrategy(groqCaps)).toBe('unified_schema');
  });
});

describe('toolsToProviderFormat', () => {
  it('converts tools to OpenAI format', () => {
    const tool = defineTool({
      name: 'search',
      description: 'Search the web',
      input: z.object({ query: z.string() }),
      execute: async () => 'results',
    });

    const result = toolsToProviderFormat([tool]);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('function');
    expect(result[0]!.function.name).toBe('search');
    expect(result[0]!.function.description).toBe('Search the web');
    expect(result[0]!.function.parameters).toBeDefined();
  });
});

describe('buildUnifiedJsonSchema', () => {
  it('builds schema with tools', () => {
    const tool = defineTool({
      name: 'search',
      description: 'Search',
      input: z.object({ q: z.string() }),
      execute: async () => '',
    });

    const schema = buildUnifiedJsonSchema([tool]);
    expect(schema['properties']).toBeDefined();
    const props = schema['properties'] as Record<string, unknown>;
    expect(props['_action']).toBeDefined();
    expect(props['tool']).toBeDefined();
    expect(props['args']).toBeDefined();
  });

  it('builds schema without tools', () => {
    const schema = buildUnifiedJsonSchema([]);
    const props = schema['properties'] as Record<string, unknown>;
    expect(props['_action']).toBeDefined();
    expect(props['tool']).toBeUndefined();
  });

  it('includes output schema properties', () => {
    const outputSchema = z.object({ answer: z.string(), confidence: z.number() });
    const schema = buildUnifiedJsonSchema([], outputSchema);
    const props = schema['properties'] as Record<string, unknown>;
    expect(props['answer']).toBeDefined();
    expect(props['confidence']).toBeDefined();
  });
});

describe('buildSystemPromptAddition', () => {
  it('includes tool descriptions', () => {
    const tool = defineTool({
      name: 'search',
      description: 'Search the web for info',
      input: z.object({ query: z.string() }),
      execute: async () => '',
    });

    const addition = buildSystemPromptAddition([tool]);
    expect(addition).toContain('search');
    expect(addition).toContain('Search the web');
    expect(addition).toContain('_action');
    expect(addition).toContain('call');
    expect(addition).toContain('respond');
  });

  it('includes output schema when provided', () => {
    const schema = z.object({ answer: z.string() });
    const addition = buildSystemPromptAddition([], schema);
    expect(addition).toContain('schema');
    expect(addition).toContain('respond');
  });
});
