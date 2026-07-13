import type { FunctionHandler, Shell } from '@niscorp/nova';
import type { Message } from '@niscorp/signal';
import { makeTools, type Turn } from './tools';
import { rayAgent } from './agent';
import { createLlmClient, getKey, setKey } from '../llm';
import { traceStore, traceWiring, type TraceStep } from './trace';
import { ensureCurrent, newSession, switchTo, setMessages, sessionList, type ChatMessage } from './sessions';

const messagesOf = (data: Record<string, unknown>): ChatMessage[] =>
  Array.isArray(data['messages']) ? (data['messages'] as ChatMessage[]) : [];

// The shell is created in nova/shell and binds itself here once built — it
// registers `ray.run`, so ray can't import the shell back (a cycle). The run
// reads it at call time.
let boundShell: Shell | undefined;
export const bindShell = (s: Shell): void => {
  boundShell = s;
};
const getShell = (): Shell => {
  if (boundShell === undefined) throw new Error('Ray: shell not bound yet');
  return boundShell;
};

// The chat transcript IS the run input (caller-owned history, per cortex v2):
// each stored line becomes a user/assistant message; the just-typed user line
// is already the last entry. SCREEN + ACTIONS ride the agent's context deps.
const toTranscript = (messages: ChatMessage[]): Message[] =>
  messages.map((m): Message =>
    m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
  );

// The agent as a Nova function. The assistant action calls `ray.run` with its
// data (the message transcript so far, including the just-typed user line); this
// runs the cortex agent (whose tools drive the same shell), persists the exchange
// to the current session, and returns the reply text (+ the tool-call trace) for
// Nova to write into the chat.
export const rayRun: FunctionHandler = async (data) => {
  const key = getKey();
  if (key === undefined) return { text: 'No Groq API key set yet — click the 🔑 button to add one.', trace: [], ms: 0 };

  const startedAt = Date.now();
  const shell = getShell();
  const turn: Turn = {};
  const messages = messagesOf(data);

  // Always capture the trace — tool calls are shown in the chat regardless of the
  // debug toggle (which only governs the expandable JSON detail in RayTrace).
  const trace: TraceStep[] = [];
  const tools = makeTools(shell, turn);
  const wiring = traceWiring(tools, trace);
  traceStore.begin();
  try {
    const result = await rayAgent.run(toTranscript(messages), {
      llm: createLlmClient(key),
      deps: { shell },
      tools,
      onEvent: wiring.onEvent,
      onToolResult: [wiring.onToolResult],
    }).result;
    if (!result.ok) throw new Error(result.error.message);

    const current = ensureCurrent();
    const ms = Date.now() - startedAt;
    const view = turn.pendingView;
    const text = result.output.response ?? '';
    // Persist the trace + duration + any rendered view with the message — always,
    // regardless of the debug toggle (visibility ≠ persistence). Restores on reopen.
    setMessages(current.id, [...messages, { role: 'ray', text, trace, ms, view }]);
    return { text, trace, ms, view };
  } finally {
    traceStore.end();
  }
};

// Mount: hand the chat its current session's messages + the session list.
export const rayLoad: FunctionHandler = async () => {
  const current = ensureCurrent();
  return { messages: current.messages, sessions: sessionList(), currentId: current.id };
};

// Start a fresh session and switch to it.
export const rayNewSession: FunctionHandler = async () => {
  const session = newSession();
  return { messages: session.messages, sessions: sessionList(), currentId: session.id };
};

// Switch to an existing session (id arrives in `$.currentId`, set just before).
export const raySwitchSession: FunctionHandler = async (data) => {
  const id = String(data['currentId'] ?? '');
  const session = switchTo(id);
  return { messages: session.messages, sessions: sessionList(), currentId: session.id };
};

// Tiny key setter — prompts for the Groq key and stores it (browser-only).
export const raySetKey: FunctionHandler = async () => {
  const entered = typeof window !== 'undefined' ? window.prompt('Groq API key (stored in this browser only):') : null;
  if (entered === null || entered.trim() === '') return 'No key entered.';
  setKey(entered.trim());
  return 'Key saved. Ask me anything.';
};
