import type { ZodType } from 'zod';
import { decodeJsonish, deepDecodeJsonish, extractJson, repairEscapeDamage, closeTruncated, isTruncatedJson } from './repair';
import type { Rejection, StepOutcome, StepToolCall, WireReport } from '../types';
import type { ResponseWireStrategy } from './strategies';

export type RouteRequest = {
  content: string;
  toolCalls: ReadonlyArray<StepToolCall>;
  declared: ReadonlySet<string>;
  outputTool?: string | undefined;
  accept?: ZodType | undefined;
  responseStrategies: ReadonlyArray<ResponseWireStrategy>;
};

export type Routed = { outcome: StepOutcome; wire: WireReport };

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

type Candidate = { value: unknown; rung: string };

const tryParse = (text: string): { ok: true; value: unknown } | { ok: false; why: string } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : String(error) };
  }
};

// The untouched text only: every later rung parses text this file has altered, so its
// complaint describes a repair and not what the model wrote.
const whyNotJson = (text: string): string | undefined => {
  const direct = tryParse(text.trim());
  return direct.ok ? undefined : direct.why;
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
  if (snippet.length === 0) return 'the turn produced no output';
  const why = whyNotJson(content);
  return why === undefined
    ? `output is not valid JSON — it began: ${snippet}`
    : `output is not valid JSON: ${why}. It began: ${snippet}`;
};

const contentTurn = (request: RouteRequest): Routed => {
  if (!request.accept) return failed('no acceptance schema for a content turn');
  const { winner, nearMiss } = firstAccepted(ladder(request.content, request.responseStrategies), request.accept);
  if (winner) return output(winner.value, winner.rung);
  return failed(contentEvidence(request.content, nearMiss), {
    truncated: isTruncatedJson(request.content),
  });
};

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
