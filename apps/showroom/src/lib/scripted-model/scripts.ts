import { registerScript, type ScriptedReply, type ScriptedRequest } from './scripted-fetch';

// ═══════════════════════════════════════════════════════════
// Helpers pages use to teach the scripted provider what to say.
// ═══════════════════════════════════════════════════════════

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s"“]+|[\s"”.!?]+$/g, '')
    .trim();

type HistoryMessage = { role: string; content?: unknown; toolCalls?: readonly { name: string; args: unknown }[] };

const parse = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/**
 * Replay a recorded conversation: when the visitor sends a message that was in
 * it, answer with what the live model actually said next — tool calls included.
 */
export const replayRecorded = (id: string, history: readonly HistoryMessage[]): void =>
  registerScript({
    id,
    source: 'recorded',
    reply: (request) => {
      const at = history.findIndex((m) => m.role === 'user' && typeof m.content === 'string' && normalize(m.content) === normalize(request.lastUser));
      if (at < 0) return undefined;
      const answers = history.slice(at + 1).filter((m, i, rest) => m.role === 'assistant' && !rest.slice(0, i).some((x) => x.role === 'user'));
      const next = answers[request.toolResultsSinceUser];
      if (next === undefined) return undefined;
      const call = next.toolCalls?.[0];
      if (call !== undefined) return { call: { name: call.name, args: parse(call.args) } };
      const content = typeof next.content === 'string' ? next.content : JSON.stringify(next.content ?? '');
      return request.schema !== undefined ? { data: parse(content) } : { text: content };
    },
  });

export type Answer = { ask: string; reply: ScriptedReply | ((request: ScriptedRequest) => ScriptedReply) };

/** Answers written for a page — replies to the prompts it offers as “Try:” chips. */
export const answerWith = (id: string, answers: readonly Answer[]): void =>
  registerScript({
    id,
    source: 'scripted',
    reply: (request) => {
      const hit = answers.find((a) => normalize(a.ask) === normalize(request.lastUser));
      if (hit === undefined) return undefined;
      return typeof hit.reply === 'function' ? hit.reply(request) : hit.reply;
    },
  });
