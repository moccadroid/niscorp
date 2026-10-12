import type { ZodType } from 'zod';
import type { Capabilities, ResponseFormat, StepToolDescriptor } from '../types';
import { SignalError, ErrorCode } from '../errors';
import { RESPOND_DESCRIPTION, corrections, finishProtocol, type ProtocolSpec } from './protocol';

export type OutputTransport = 'respond' | 'native' | 'emit';

export type ResponseMode = 'required' | 'optional';

export type TransportSpec = {
  wire: ZodType;
  looseWire: ZodType;
  responseMode: ResponseMode;
  hasData: boolean;
  hasTools: boolean;
  choice?: 'auto' | OutputTransport;
  forceTool?: boolean;
};

export type ResolvedTransport = {
  transport: OutputTransport;
  responseMode: ResponseMode;
  respondDetail?: 'full' | 'loose' | 'permissive';
  respondDescriptor?: StepToolDescriptor;
  outputToolName?: string;
  responseFormat?: ResponseFormat;
  toolChoice?: 'required';
  injectSchemaDoc: boolean;
  finishProtocol: string;
  corrections: { termination: string; invalidOutput: string };
};

export const RESPOND_TOOL_NAME = 'respond';

const FULL_PARAMS_MAX_CHARS = 8_192;

type SchemaAnalysis = { serialized: Record<string, unknown> | null; hasRef: boolean; size: number };

const analyzeWireSchema = (schema: ZodType): SchemaAnalysis => {
  try {
    const serialized = schema['~standard'].jsonSchema.output({ target: 'draft-07' });
    const text = JSON.stringify(serialized);
    return { serialized, hasRef: text.includes('"$ref"'), size: text.length };
  } catch {
    return { serialized: null, hasRef: false, size: Number.POSITIVE_INFINITY };
  }
};

// Converted by the schema's own zod, not by ours: the caller's schema may come from another
// zod copy, whose metadata is not in our registry.
const toJsonSchemaRecord = (schema: ZodType): Record<string, unknown> => {
  const convert = schema['~standard'].jsonSchema.output;
  try {
    return convert({ target: 'draft-07' });
  } catch {
    return convert({ target: 'draft-07', libraryOptions: { unrepresentable: 'any' } });
  }
};

// A provider that validates tool arguments answers a mismatch with a 400 for the whole
// request, which loses an attempt the repair ladder would have saved. So its params name
// the envelope fields and constrain nothing.
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

  // `respond` is picked only where its tool params enforce the contract. Anywhere else it
  // adds a synthetic tool and the contract rides the prompt, as it does under `emit`.
  const respondEnforces = !caps.validatesToolArgs && !caps.manglesNestedToolArgs && (!spec.hasData || fullIsViable);

  let transport: OutputTransport;
  if (choice !== 'auto') transport = choice;
  else if (nativeIsViable && spec.hasData) transport = 'native';
  else if (respondEnforces || spec.forceTool) transport = 'respond';
  else transport = 'emit';

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
        // Strict mode rejects open records and several keywords; non-strict still constrains.
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
