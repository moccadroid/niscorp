import type { OutputTransport, ResponseMode } from './resolve';

// ═══════════════════════════════════════════════════════════
// Protocol text — EVERY word signal ever puts in a prompt
// ═══════════════════════════════════════════════════════════
//
// Signal is a wire library, not a prompt author. The one exception is
// transport knowledge — how the run ENDS on the resolved transport —
// because only signal knows which transport resolved. All of that
// prose lives HERE and nowhere else; prompt text in any other signal
// file is a review failure. Each template below is one full sentence
// block: read it top to bottom and you read what the model sees.

// ─── The exit tool (respond transport) ──────────────────────

export const RESPOND_DESCRIPTION =
  'Finish the task. Call this EXACTLY ONCE, ALONE in its own turn, with your final envelope: ' +
  '{ response?: string (human-facing text), data (the payload), reasoning?: string (why) }. ' +
  'Calling this ends the run.';

// ─── The finish protocol chunk ──────────────────────────────

export type ProtocolSpec = {
  transport: OutputTransport;
  responseMode: ResponseMode;
  hasData: boolean;
  hasTools: boolean;
  injectSchemaDoc: boolean;
};

// {shape} = the envelope shape line; {note} = schema pointer or ''.

const EMIT_WITH_TOOLS = (shape: string, note: string): string =>
  `FINISH PROTOCOL: Use your tools as needed. To finish, your ENTIRE final message must be ONLY the JSON envelope ${shape} — raw JSON, no prose around it, no code fences.${note} A message without tool calls is treated as your final envelope.`;

const EMIT_TOOLLESS = (shape: string, note: string): string =>
  `FINISH PROTOCOL: Your ENTIRE final message must be ONLY the JSON envelope ${shape} — raw JSON, no prose around it, no code fences.${note}`;

const NATIVE = (shape: string, note: string): string =>
  `FINISH PROTOCOL: To finish, reply with no tool calls; your reply is the JSON envelope ${shape}.${note}`;

const RESPOND = (shape: string, note: string): string =>
  `FINISH PROTOCOL: To finish, call the \`respond\` tool ALONE in its own turn with the envelope ${shape} as its arguments — or reply with ONLY that JSON envelope as your entire message.${note}`;

// KEY ORDER IS LOAD-BEARING. A model emits JSON in the order it is shown, so a
// field declared after `data` is written after the answer it is supposed to
// explain — post-hoc justification, and pure latency. `reasoning` therefore
// comes FIRST, where writing it conditions everything that follows.
//
// Consumers read by key and do not care; only generation order changes.
const envelopeShape = (spec: ProtocolSpec): string => {
  if (!spec.hasData) return '{ "reasoning"?: string, "response": string }';
  return spec.responseMode === 'required'
    ? '{ "reasoning"?: string, "response": string, "data": <the payload> }'
    : '{ "reasoning"?: string, "response"?: string, "data": <the payload> }';
};

export const finishProtocol = (spec: ProtocolSpec): string => {
  const shape = envelopeShape(spec);
  const note = spec.hasData && spec.injectSchemaDoc ? ' `data` must match the OUTPUT SCHEMA above.' : '';
  switch (spec.transport) {
    case 'emit':
      return spec.hasTools ? EMIT_WITH_TOOLS(shape, note) : EMIT_TOOLLESS(shape, note);
    case 'native':
      return NATIVE(shape, note);
    case 'respond':
      return RESPOND(shape, note);
  }
};

// ─── Corrections ────────────────────────────────────────────
// {issues} is replaced by the caller with the concrete evidence.

const RESPOND_TERMINATION =
  'You did not finish. Either call the `respond` tool with your final envelope ({ response?, data, reasoning? }), or reply with ONLY that JSON envelope as your entire message — no surrounding prose.';

const RESPOND_INVALID =
  'Your output was invalid: {issues}. Either call `respond`, or reply with ONLY the corrected JSON envelope — no prose.';

const CONTENT_TERMINATION =
  'You did not finish. Reply with ONLY the JSON envelope ({ response?, data, reasoning? }) as your entire message — no surrounding prose, no code fences.';

const CONTENT_INVALID =
  'Your output was invalid: {issues}. Reply with ONLY the corrected JSON envelope as your entire message.';

export const corrections = (transport: OutputTransport): { termination: string; invalidOutput: string } =>
  transport === 'respond'
    ? { termination: RESPOND_TERMINATION, invalidOutput: RESPOND_INVALID }
    : { termination: CONTENT_TERMINATION, invalidOutput: CONTENT_INVALID };

// ─── Bare-schema output (the high-level complete()/stream() API) ───
// Used when the caller's schema cannot ride a native response_format:
// the contract goes into the prompt and the wire ladder gates arrivals.

export const bareSchemaPrompt = (jsonSchema: string): string =>
  `OUTPUT SCHEMA: your final reply must be ONLY a JSON value matching this schema — raw JSON, no prose, no code fences:\n${jsonSchema}`;

export const bareSchemaCorrection = (issues: string): string =>
  `Your output was invalid: ${issues}. Reply with ONLY the corrected JSON value matching the OUTPUT SCHEMA.`;
