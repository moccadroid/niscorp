import { z, type ZodType } from 'zod';
import type { Capabilities, ResponseFormat, StepToolDescriptor } from '../types';
import { SignalError, ErrorCode } from '../errors';
import { RESPOND_DESCRIPTION, corrections, finishProtocol, type ProtocolSpec } from './protocol';

// ═══════════════════════════════════════════════════════════
// Transport resolution — which channel carries the caller's output
// ═══════════════════════════════════════════════════════════
//
// Signal's contract is "what comes out conforms to the schema that
// went in"; the transport is HOW signal keeps that promise on this
// provider. Callers (cortex) describe their output contract once and
// stay provider-blind — they never learn which transport ran except
// as reporting.
//
//   respond — a synthetic exit tool; the output rides its arguments.
//   native  — provider grammar (response_format: json_schema).
//   emit    — the content channel; the completion IS the output.
//
// Resolution is a PURE function of the spec and the capabilities:
// no client, no network — previews resolve exactly like runs.

export type OutputTransport = 'respond' | 'native' | 'emit';

export type ResponseMode = 'required' | 'optional';

export type TransportSpec = {
  // The full wire schema of the output contract (what the model must
  // produce). Used for grammar / tool params when viable; NEVER sent
  // to hard-validating providers.
  wire: ZodType;
  // Loose variant (payload fields untyped) for large or recursive
  // contracts whose real schema rides prompt documentation.
  looseWire: ZodType;
  responseMode: ResponseMode;
  // Does the contract carry a typed payload (a `data` field)?
  hasData: boolean;
  hasTools: boolean;
  // Explicit transport override; 'auto' resolves from capabilities.
  choice?: 'auto' | OutputTransport;
  // Force every turn to be a tool call ('respond' transport only).
  forceTool?: boolean;
};

export type ResolvedTransport = {
  transport: OutputTransport;
  responseMode: ResponseMode;
  // respond: how much of the contract went into the tool params.
  // 'permissive' = the provider validates tool args server-side; the
  // wire params constrain nothing and the contract rides prompt docs.
  respondDetail?: 'full' | 'loose' | 'permissive';
  // respond: the synthetic exit tool to append to the request. NOT a
  // domain tool — the router treats its calls as output attempts.
  respondDescriptor?: StepToolDescriptor;
  // The exit tool's name when one exists (delta attribution: callers
  // stream its argument fragments as output partials).
  outputToolName?: string;
  // native: sent on every request.
  responseFormat?: ResponseFormat;
  // 'required' when forceTool hardening is on.
  toolChoice?: 'required';
  // Should the caller inject its own schema documentation as prompt
  // context? (True whenever the wire contract is not fully carried by
  // the transport itself.)
  injectSchemaDoc: boolean;
  // ONE transport-owned system chunk stating how the run ends. Callers
  // inject it verbatim as the last prompt chunk — they never author
  // finish instructions (they cannot know which transport resolved).
  finishProtocol: string;
  // Correction texts, phrased for this transport. {issues} is replaced
  // by the caller with the concrete evidence.
  corrections: { termination: string; invalidOutput: string };
};

export const RESPOND_TOOL_NAME = 'respond';

// Serialized-schema analysis for the full-vs-loose decision. `full`
// requires: serializes cleanly, no $ref (recursion / shared defs),
// and small enough not to bloat every request.
const FULL_PARAMS_MAX_CHARS = 8_192;

type SchemaAnalysis = { serialized: Record<string, unknown> | null; hasRef: boolean; size: number };

const toRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

const analyzeWireSchema = (schema: ZodType): SchemaAnalysis => {
  try {
    const serialized = toRecord(z.toJSONSchema(schema, { target: 'draft-7' }));
    const text = JSON.stringify(serialized);
    return { serialized, hasRef: text.includes('"$ref"'), size: text.length };
  } catch {
    return { serialized: null, hasRef: false, size: Number.POSITIVE_INFINITY };
  }
};

const toJsonSchemaRecord = (schema: ZodType): Record<string, unknown> => {
  try {
    return toRecord(z.toJSONSchema(schema, { target: 'draft-7' }));
  } catch {
    return toRecord(z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }));
  }
};

// ───────────────────────────────────────────────────────────
// resolveTransport
// ───────────────────────────────────────────────────────────

// The exit tool's params by provider temperament. Hard-validating
// providers (validatesToolArgs) 400 the WHOLE request when args miss
// the declared schema — killing exactly the attempts the wire layer's
// repair ladder saves. There the params name the envelope fields but
// constrain nothing (never advertising a field the contract doesn't
// accept); the contract rides prompt docs, validation is client-side.
const respondParams = (
  spec: TransportSpec,
  caps: Capabilities,
  analysis: SchemaAnalysis,
  fullIsViable: boolean,
): { detail: 'full' | 'loose' | 'permissive'; parameters: Record<string, unknown> } => {
  if (caps.validatesToolArgs) {
    return {
      detail: 'permissive',
      parameters: {
        type: 'object',
        properties: spec.hasData ? { response: {}, data: {}, reasoning: {} } : { response: {}, reasoning: {} },
      },
    };
  }
  if (!spec.hasData || fullIsViable) {
    return { detail: 'full', parameters: analysis.serialized ?? toJsonSchemaRecord(spec.wire) };
  }
  return { detail: 'loose', parameters: toJsonSchemaRecord(spec.looseWire) };
};

const protocolSpec = (transport: OutputTransport, spec: TransportSpec, injectSchemaDoc: boolean): ProtocolSpec => ({
  transport,
  responseMode: spec.responseMode,
  hasData: spec.hasData,
  hasTools: spec.hasTools,
  injectSchemaDoc,
});

export const resolveTransport = (spec: TransportSpec, caps: Capabilities): ResolvedTransport => {
  const analysis = analyzeWireSchema(spec.wire);
  const fullIsViable = analysis.serialized !== null && !analysis.hasRef && analysis.size <= FULL_PARAMS_MAX_CHARS;

  const nativeIsViable = caps.nativeJsonSchema && fullIsViable && (!spec.hasTools || caps.toolsWithStructuredOutput);

  const choice = spec.choice ?? 'auto';
  if (choice === 'native' && !nativeIsViable) {
    throw new SignalError(
      spec.hasTools && !caps.toolsWithStructuredOutput
        ? 'transport "native" needs a provider that combines tools with response_format (capabilities.toolsWithStructuredOutput)'
        : 'transport "native" needs capabilities.nativeJsonSchema and a wire schema that serializes small and non-recursive',
      ErrorCode.VALIDATION_FAILED,
    );
  }

  // Providers that corrupt structured tool-call args (Groq gpt-oss
  // stringifies nested arrays inside function args while emitting the
  // identical JSON cleanly as content) get the content channel.
  // Explicit respond/native choices are still honored.
  let transport: OutputTransport;
  if (choice !== 'auto') transport = choice;
  else if (caps.manglesNestedToolArgs) transport = 'emit';
  else if (nativeIsViable && spec.hasData) transport = 'native';
  else transport = 'respond';

  if (transport === 'emit' && spec.forceTool) {
    throw new SignalError(
      'output.forceTool cannot combine with the emit transport — the final turn must be a content-only message',
      ErrorCode.VALIDATION_FAILED,
    );
  }

  if (transport === 'native') {
    const serialized = analysis.serialized ?? toJsonSchemaRecord(spec.wire);
    const injectSchemaDoc = false;
    return {
      transport,
      responseMode: spec.responseMode,
      responseFormat: {
        type: 'json_schema',
        // strict:false — strict mode rejects open records and several
        // keywords; non-strict still constrains and never hard-fails.
        jsonSchema: { name: 'envelope', strict: false, schema: serialized },
      },
      injectSchemaDoc,
      finishProtocol: finishProtocol(protocolSpec(transport, spec, injectSchemaDoc)),
      corrections: corrections(transport),
    };
  }

  if (transport === 'emit') {
    const injectSchemaDoc = spec.hasData;
    return {
      transport,
      responseMode: spec.responseMode,
      injectSchemaDoc,
      finishProtocol: finishProtocol(protocolSpec(transport, spec, injectSchemaDoc)),
      corrections: corrections(transport),
    };
  }

  const { detail: respondDetail, parameters } = respondParams(spec, caps, analysis, fullIsViable);
  const injectSchemaDoc = spec.hasData && respondDetail !== 'full';
  return {
    transport,
    responseMode: spec.responseMode,
    respondDetail,
    respondDescriptor: { name: RESPOND_TOOL_NAME, description: RESPOND_DESCRIPTION, parameters },
    outputToolName: RESPOND_TOOL_NAME,
    ...(spec.forceTool && { toolChoice: 'required' as const }),
    injectSchemaDoc,
    finishProtocol: finishProtocol(protocolSpec(transport, spec, injectSchemaDoc)),
    corrections: corrections(transport),
  };
};
