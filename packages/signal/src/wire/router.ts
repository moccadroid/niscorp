import type { ZodType } from 'zod';
import { decodeJsonish, deepDecodeJsonish, extractJson, repairEscapeDamage, closeTruncated, isTruncatedJson } from './repair';
import type { Rejection, StepOutcome, StepToolCall, WireReport } from '../types';
import type { ResponseWireStrategy } from './strategies';

// ═══════════════════════════════════════════════════════════
// The router — normalize one response, decide what it IS
// ═══════════════════════════════════════════════════════════
//
// One rule, no name games:
//   - a call matching a DECLARED tool is a tool call;
//   - anything else whose repaired value validates against the
//     acceptance schema is OUTPUT;
//   - what survives neither is a typed failure with evidence.
//
// Repairs are rescue-only: a candidate counts ONLY when it passes the
// acceptance gate; a clean response wins at the first rung untouched.

export type RouteRequest = {
  content: string;
  toolCalls: ReadonlyArray<StepToolCall>;
  declared: ReadonlySet<string>;
  // The synthetic EXIT tool (respond transport): declared to the
  // provider so its calls are wire-legal, but semantically OUTPUT.
  outputTool?: string | undefined;
  accept?: ZodType | undefined;
  responseStrategies: ReadonlyArray<ResponseWireStrategy>;
};

export type Routed = { outcome: StepOutcome; wire: WireReport };

// ─── Result constructors — every return site goes through these ───

const toolTurn = (calls: StepToolCall[], notes: string[]): Routed => ({
  outcome: { kind: 'tool_calls', calls },
  wire: notes.length > 0 ? { notes } : {},
});

const output = (value: unknown, rung: string, note?: string): Routed => ({
  outcome: { kind: 'output', value },
  wire: note === undefined ? { rung } : { rung, notes: [note] },
});

const failed = (evidence: string, flags: { truncated?: boolean } = {}): Routed => ({
  outcome: {
    kind: 'failed',
    evidence,
    ...(flags.truncated === true && { truncated: true }),
  },
  wire: {},
});

// ─── Candidates — the default repair ladder, least-invasive first ───

type Candidate = { value: unknown; rung: string };

const tryParse = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

function* ladder(text: string, strategies: ReadonlyArray<ResponseWireStrategy>): Generator<Candidate> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return;

  const direct = tryParse(trimmed);
  if (direct.ok) yield { value: direct.value, rung: 'parse' };

  const extracted = extractJson(trimmed);
  if (extracted.ok) yield { value: extracted.value, rung: 'extract' };

  for (const repaired of repairEscapeDamage(trimmed)) {
    const parsed = tryParse(repaired);
    if (parsed.ok) yield { value: parsed.value, rung: 'repair-escapes' };
  }

  for (const strategy of strategies) {
    for (const candidateText of strategy.candidates(trimmed)) {
      const parsed = tryParse(candidateText);
      if (parsed.ok) yield { value: parsed.value, rung: strategy.id };
    }
  }

  const closed = closeTruncated(trimmed);
  if (closed !== undefined) {
    const parsed = tryParse(closed);
    if (parsed.ok) yield { value: parsed.value, rung: 'close-truncated' };
  }
}

// Gate candidates (and their deep-decoded variants). Returns the RAW
// winning candidate — the schema is a gate, not a transform. The gate
// is a TRANSPORT concern; near-miss evidence here is deliberately
// plain (semantic evidence belongs to the caller's own validation).
const firstAccepted = (
  candidates: Iterable<Candidate>,
  accept: ZodType,
): { winner?: Candidate; nearMiss?: string } => {
  let nearMiss: string | undefined;
  for (const candidate of candidates) {
    const direct = accept.safeParse(candidate.value);
    if (direct.success) return { winner: candidate };
    const deep = deepDecodeJsonish(candidate.value);
    if (deep !== candidate.value && accept.safeParse(deep).success) {
      return { winner: { value: deep, rung: `${candidate.rung}+deep-decode` } };
    }
    nearMiss ??= direct.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
  }
  return { ...(nearMiss !== undefined && { nearMiss }) };
};

const decodedCall = (call: StepToolCall): StepToolCall => ({ ...call, args: decodeJsonish(call.args) });

// ─── The three turn shapes ──────────────────────────────────

// A call that is NOT a domain tool call delivers output through its
// args (the exit tool, or pseudo-tool fixation). undefined = nothing
// salvageable and nothing near — the caller picks the fallback.
const finishAttempt = (call: StepToolCall, request: RouteRequest): Routed | undefined => {
  if (!request.accept) return undefined;
  const source: Iterable<Candidate> =
    typeof call.args === 'string'
      ? ladder(call.args, request.responseStrategies)
      : [{ value: call.args, rung: 'call-args' }];
  const { winner, nearMiss } = firstAccepted(source, request.accept);
  if (winner) {
    const note = call.name === request.outputTool ? undefined : `output arrived as a call to undeclared tool "${call.name}"`;
    return output(winner.value, winner.rung, note);
  }
  if (nearMiss !== undefined) {
    return failed(`the call to "${call.name}" carried an invalid output: ${nearMiss}`);
  }
  return undefined;
};

const contentEvidence = (content: string, nearMiss: string | undefined): string => {
  if (nearMiss !== undefined) return nearMiss;
  const snippet = content.trim().slice(0, 160);
  return snippet.length > 0 ? `output is not valid JSON — it began: ${snippet}` : 'the turn produced no output';
};

const contentTurn = (request: RouteRequest): Routed => {
  if (!request.accept) return failed('no acceptance schema for a content turn');
  const { winner, nearMiss } = firstAccepted(ladder(request.content, request.responseStrategies), request.accept);
  if (winner) return output(winner.value, winner.rung);
  return failed(contentEvidence(request.content, nearMiss), {
    truncated: isTruncatedJson(request.content),
  });
};

// ─── routeResponse — a response the provider ACCEPTED ───────

export const routeResponse = (request: RouteRequest): Routed => {
  const isExit = (call: StepToolCall): boolean => call.name === request.outputTool;
  const domainCalls = request.toolCalls.filter((call) => request.declared.has(call.name) && !isExit(call));
  const attempts = request.toolCalls.filter((call) => !request.declared.has(call.name) || isExit(call));

  if (domainCalls.length > 0) {
    const dropped = attempts.map((call) => `dropped call to "${call.name}" in a mixed turn — finish attempts must come alone`);
    return toolTurn(domainCalls.map(decodedCall), dropped);
  }
  for (const call of attempts) {
    const routed = finishAttempt(call, request);
    if (routed) return routed;
  }
  if (attempts.length > 0) {
    return failed(`called unknown tool(s) ${attempts.map((call) => `"${call.name}"`).join(', ')}`);
  }
  return contentTurn(request);
};

// ─── routeRejection — the 400 carried the payload ───────────
//
// The routing rule is identical. A recovered call to a DECLARED tool
// becomes a normal tool call (its args are judged by the tool's own
// schema downstream); anything else is a finish attempt.

let recoveredCallCounter = 0;

export const routeRejection = (rejection: Rejection, request: Omit<RouteRequest, 'content' | 'toolCalls'>): Routed => {
  const name = rejection.name;
  if (name !== undefined && request.declared.has(name) && name !== request.outputTool) {
    recoveredCallCounter += 1;
    const args = rejection.args ?? decodeJsonish(rejection.argsText);
    return toolTurn([{ id: `recovered_${recoveredCallCounter}`, name, args }], []);
  }

  const call: StepToolCall = { id: '', name: name ?? '', args: rejection.args ?? rejection.argsText };
  const routed = finishAttempt(call, { ...request, content: '', toolCalls: [] });
  if (routed) {
    if (routed.outcome.kind === 'failed' && rejection.truncated) {
      return { ...routed, outcome: { ...routed.outcome, truncated: true } };
    }
    return routed;
  }
  return failed(
    rejection.argsText.length > 0
      ? `provider rejected the attempt${name !== undefined ? ` (call to unknown tool "${name}")` : ''} and nothing salvageable remained`
      : 'provider rejected the attempt; nothing was recovered',
    { truncated: rejection.truncated },
  );
};
