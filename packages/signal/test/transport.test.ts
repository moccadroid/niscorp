import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { Capabilities } from '../src/types';
import { resolveTransport, type TransportSpec } from '../src/transport/resolve';

// Transport resolution is a PURE function of (spec, capabilities) —
// ported from cortex when transport became signal's business.

const LIMITED: Capabilities = {
  nativeTools: true,
  nativeJsonSchema: false,
  nativeJsonMode: true,
  toolsWithStructuredOutput: false,
  validatesToolArgs: false,
  manglesNestedToolArgs: false,
  multimodal: false,
  supportsEmbedding: false,
};
const GROQ: Capabilities = { ...LIMITED, validatesToolArgs: true, manglesNestedToolArgs: true };
const OPENAI: Capabilities = {
  ...LIMITED,
  nativeJsonSchema: true,
  toolsWithStructuredOutput: true,
  multimodal: true,
  supportsEmbedding: true,
};

const Small = z.object({ label: z.string(), score: z.number() });

type Node = string | { kids: Node[] };
const Recursive: z.ZodType<Node> = z.lazy(() => z.union([z.string(), z.object({ kids: z.array(Recursive) })]));

const wireOf = (data?: z.ZodType, responseMode: 'required' | 'optional' = 'optional'): { wire: z.ZodType; looseWire: z.ZodType } => {
  const response = responseMode === 'required' ? z.string() : z.string().optional();
  const reasoning = z.string().optional();
  return {
    wire: data ? z.object({ response, data, reasoning }) : z.object({ response, reasoning }),
    looseWire: data
      ? z.object({ response, data: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]), reasoning })
      : z.object({ response, reasoning }),
  };
};

const spec = (data: z.ZodType | undefined, over: Partial<TransportSpec> = {}): TransportSpec => ({
  ...wireOf(data, over.responseMode ?? 'optional'),
  responseMode: over.responseMode ?? 'optional',
  hasData: data !== undefined,
  hasTools: true,
  ...over,
});

describe('resolveTransport — auto', () => {
  it('picks respond+full on providers that cannot combine tools with response_format', () => {
    const resolved = resolveTransport(spec(Small), LIMITED);
    expect(resolved.transport).toBe('respond');
    expect(resolved.respondDetail).toBe('full');
    expect(resolved.respondDescriptor?.name).toBe('respond');
    expect(resolved.injectSchemaDoc).toBe(false);
  });

  it('picks native for small schemas on capable providers', () => {
    const resolved = resolveTransport(spec(Small), OPENAI);
    expect(resolved.transport).toBe('native');
    expect(resolved.responseFormat?.type).toBe('json_schema');
  });

  it('falls back to respond+loose for recursive contracts and asks for schema docs', () => {
    const resolved = resolveTransport(spec(z.object({ tree: Recursive })), OPENAI);
    expect(resolved.transport).toBe('respond');
    expect(resolved.respondDetail).toBe('loose');
    expect(resolved.injectSchemaDoc).toBe(true);
    expect(JSON.stringify(resolved.respondDescriptor?.parameters)).not.toContain('$ref');
  });

  it('arg-mangling providers resolve to emit — content channel, schema docs when data exists', () => {
    const withData = resolveTransport(spec(Small), GROQ);
    expect(withData.transport).toBe('emit');
    expect(withData.injectSchemaDoc).toBe(true);
    expect(withData.respondDescriptor).toBeUndefined();
    expect(withData.responseFormat).toBeUndefined();

    const chat = resolveTransport(spec(undefined, { responseMode: 'required', hasTools: false }), GROQ);
    expect(chat.transport).toBe('emit');
    expect(chat.injectSchemaDoc).toBe(false);
  });
});

describe('resolveTransport — hard-validating providers, explicit respond', () => {
  it('respond params are permissive: named fields, no constraints', () => {
    const resolved = resolveTransport(spec(Small, { choice: 'respond' }), GROQ);
    expect(resolved.respondDetail).toBe('permissive');
    expect(resolved.respondDescriptor?.parameters).toEqual({
      type: 'object',
      properties: { response: {}, data: {}, reasoning: {} },
    });
    expect(resolved.injectSchemaDoc).toBe(true);
  });

  it('never advertises data to a contract without one', () => {
    const resolved = resolveTransport(spec(undefined, { choice: 'respond', responseMode: 'required' }), GROQ);
    expect(resolved.respondDescriptor?.parameters).toEqual({
      type: 'object',
      properties: { response: {}, reasoning: {} },
    });
    expect(resolved.injectSchemaDoc).toBe(false);
  });
});

describe('resolveTransport — protocol text and guards', () => {
  it('the finish protocol is phrased per transport and never mentions respond under emit', () => {
    const emit = resolveTransport(spec(Small), GROQ);
    expect(emit.finishProtocol).toContain('ENTIRE final message');
    expect(emit.finishProtocol).not.toContain('respond');

    const respond = resolveTransport(spec(Small), LIMITED);
    expect(respond.finishProtocol).toContain('`respond`');
    expect(respond.finishProtocol).toContain('ONLY that JSON envelope');
  });

  it('toolless emit drops the tools phrasing', () => {
    const resolved = resolveTransport(spec(Small, { hasTools: false }), GROQ);
    expect(resolved.finishProtocol).not.toContain('tools');
  });

  it('forcing native on an incapable provider throws', () => {
    expect(() => resolveTransport(spec(Small, { choice: 'native' }), LIMITED)).toThrow(/native/);
  });

  it('forceTool cannot combine with emit', () => {
    expect(() => resolveTransport(spec(Small, { forceTool: true }), GROQ)).toThrow(/forceTool/);
  });

  it('forceTool under respond pins toolChoice required', () => {
    const resolved = resolveTransport(spec(Small, { forceTool: true }), LIMITED);
    expect(resolved.toolChoice).toBe('required');
  });
});
