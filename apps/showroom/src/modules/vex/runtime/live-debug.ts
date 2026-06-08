import type { SignalClient } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════
// Live debug recorder — wraps the SignalClient so every LLM round
// trip (including each retry) is captured: the messages we sent, the
// raw content the model returned, its tool calls, finish reason, and
// tokens. A run sets a fresh recorder; the wrapped client writes into
// it; run.ts reads it back for the Debug inspector tab. Single-
// threaded + sequential runs make a module-level "current" safe.
// ═══════════════════════════════════════════════════════════

export type LlmExchange = {
  iteration: number;
  label: string;
  tools: string[];
  sentMessages: { role: string; chars: number; preview: string }[];
  responseContent: string;
  toolCalls: { name: string; args: unknown }[];
  finishReason: string;
  tokens: number;
  ms: number;
  // Raw provider payload — for error_recovered turns this is the
  // underlying provider error (groq's code + failed_generation),
  // which Signal otherwise swallows.
  raw?: unknown;
};

let current: LlmExchange[] | undefined;

export const startRecording = (): void => {
  current = [];
};

export const stopRecording = (): LlmExchange[] => {
  const captured = current ?? [];
  current = undefined;
  return captured;
};

type StepReq = Parameters<SignalClient['step']>[0];
type StepRes = Awaited<ReturnType<SignalClient['step']>>;

const asText = (content: unknown): string =>
  typeof content === 'string' ? content : JSON.stringify(content);

// Wrap a SignalClient so its `step` calls are recorded when a
// recording is active. stream/count pass through untouched.
export const wrapForDebug = (llm: SignalClient, label: string): SignalClient => {
  let iteration = 0;
  return {
    step: async (request: StepReq): Promise<StepRes> => {
      iteration += 1;
      const t0 = performance.now();
      const res = await llm.step(request);
      const ms = Math.round(performance.now() - t0);
      if (current !== undefined) {
        current.push({
          iteration,
          label,
          tools: (request.tools ?? []).map((t) => t.name),
          sentMessages: request.messages.map((m) => {
            const text = asText(m.content);
            return { role: m.role, chars: text.length, preview: text.slice(0, 4000) };
          }),
          responseContent: res.content,
          toolCalls: res.toolCalls.map((tc) => ({ name: tc.name, args: tc.args })),
          finishReason: res.finishReason,
          tokens: res.usage.totalTokens,
          ms,
          raw: res.raw,
        });
      }
      return res;
    },
    stepStream: llm.stepStream.bind(llm),
    count: llm.count.bind(llm),
  };
};
