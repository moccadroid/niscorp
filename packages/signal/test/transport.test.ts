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
// Groq's endpoint validates tool args itself, whichever model it serves.
const GROQ: Capabilities = { ...LIMITED, validatesToolArgs: true };
// A model that mangles nested tool args, on an endpoint that does NOT validate.
const MANGLER: Capabilities = { ...LIMITED, manglesNestedToolArgs: true };
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

  // Loose params would enforce nothing, so respond has no business here: the
  // contract rides the prompt either way, and emit carries it without a tool.
  it('recursive contracts resolve to emit, with schema docs and no $ref anywhere', () => {
    const resolved = resolveTransport(spec(z.object({ tree: Recursive })), OPENAI);
    expect(resolved.transport).toBe('emit');
    expect(resolved.injectSchemaDoc).toBe(true);
    expect(resolved.respondDescriptor).toBeUndefined();
  });

  // THE CASE THE RULE EXISTS FOR: a model that carries nested args cleanly, on
  // an endpoint that validates them itself. respond's params would be sent
  // permissive — enforcing nothing — so it resolves to emit anyway.
  it('hard-validating endpoints resolve to emit even for a model that does not mangle', () => {
    const withData = resolveTransport(spec(Small), GROQ);
    expect(withData.transport).toBe('emit');
    expect(withData.injectSchemaDoc).toBe(true);
    expect(withData.respondDescriptor).toBeUndefined();
    expect(withData.responseFormat).toBeUndefined();

    const chat = resolveTransport(spec(undefined, { responseMode: 'required', hasTools: false }), GROQ);
    expect(chat.transport).toBe('emit');
    expect(chat.injectSchemaDoc).toBe(false);
  });

  it('a model that mangles nested args never gets respond, even where params could enforce', () => {
    expect(resolveTransport(spec(Small), MANGLER).transport).toBe('emit');
    expect(resolveTransport(spec(undefined, { responseMode: 'required' }), MANGLER).transport).toBe('emit');
  });
});

describe('resolveTransport — explicit respond on a large contract', () => {
  it('recursive contracts get loose params and schema docs', () => {
    const resolved = resolveTransport(spec(z.object({ tree: Recursive }), { choice: 'respond' }), OPENAI);
    expect(resolved.respondDetail).toBe('loose');
    expect(resolved.injectSchemaDoc).toBe(true);
    expect(JSON.stringify(resolved.respondDescriptor?.parameters)).not.toContain('$ref');
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

  it('forceTool cannot combine with an explicit emit', () => {
    expect(() => resolveTransport(spec(Small, { forceTool: true, choice: 'emit' }), GROQ)).toThrow(/forceTool/);
  });

  // forceTool means "respond is the only exit"; under auto it IS a choice of
  // respond, even where respond would not otherwise be picked.
  it('forceTool under auto resolves to respond on a hard-validating endpoint', () => {
    const resolved = resolveTransport(spec(Small, { forceTool: true }), GROQ);
    expect(resolved.transport).toBe('respond');
    expect(resolved.respondDetail).toBe('permissive');
    expect(resolved.toolChoice).toBe('required');
  });

  it('forceTool under respond pins toolChoice required', () => {
    const resolved = resolveTransport(spec(Small, { forceTool: true }), LIMITED);
    expect(resolved.toolChoice).toBe('required');
  });
});
