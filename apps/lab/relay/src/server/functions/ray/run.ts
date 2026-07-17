import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import { makeTools, type Turn } from './tools';
import { rayAgent } from './agent';
import { createLlmClient, getKey } from '@relay/server/llm';
import { traceWiring, type TraceStep } from './trace';
import { sessionStore, type ChatMessage } from './sessions';
import { rayEngine, type RayContext } from './engine';

const messagesOf = (data: Record<string, unknown>): ChatMessage[] =>
  Array.isArray(data['messages']) ? (data['messages'] as ChatMessage[]) : [];

// The chat transcript IS the run input (caller-owned history, per cortex v2):
// each stored line becomes a user/assistant message; the just-typed user line
// is already the last entry. SCREEN + ACTIONS ride the agent's context deps.
const toTranscript = (messages: ChatMessage[]): Message[] =>
  messages.map((m): Message =>
    m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
  );

// ═══════════════════════════════════════════════════════════
// Ray as the manifest's in-process functions — the `fn:` escape hatch,
// server-side. moss builds these once per session: the handlers close over
// the session's living shell (Ray's tools drive it directly), the caller's
// compiled scope policy (Ray reads what you read), and the environment
// (keys from .env, the engine over the server's own pool). Nothing
// LLM-shaped runs in a browser.
// ═══════════════════════════════════════════════════════════
export const rayFunctions = (session: FunctionSession): Record<string, FunctionHandler> => {
  const userId = session.principal ?? 'anonymous';
  const store = sessionStore(userId);
  const ray: RayContext = {
    // lazy: moss hands the shell just after the session finishes building
    get shell() {
      return session.shell;
    },
    userId,
    policy: session.policy,
    engine: () => rayEngine(session.runtime, session.policy),
  };

  const run: FunctionHandler = async (data) => {
    const key = getKey();
    if (key === undefined) return { text: 'No LLM key configured — set GROQ_API_KEY in the server\'s .env.', trace: [], ms: 0 };

    const startedAt = Date.now();
    const turn: Turn = {};
    const messages = messagesOf(data);

    // Always capture the trace — tool calls are shown in the chat regardless of
    // the debug toggle (which only governs the expandable JSON detail).
    const trace: TraceStep[] = [];
    const tools = makeTools(ray, turn);
    const wiring = traceWiring(tools, trace);
    const result = await rayAgent.run(toTranscript(messages), {
      llm: createLlmClient(key),
      deps: { shell: ray.shell },
      tools,
      onEvent: wiring.onEvent,
      onToolResult: [wiring.onToolResult],
    }).result;
    if (!result.ok) throw new Error(result.error.message);

    const current = store.ensureCurrent();
    const ms = Date.now() - startedAt;
    const view = turn.pendingView;
    const text = result.output.response ?? '';
    // Persist the trace + duration + any rendered view with the message —
    // always (visibility ≠ persistence). Restores on reopen.
    store.setMessages(current.id, [...messages, { role: 'ray', text, trace, ms, view }]);
    return { text, trace, ms, view };
  };

  // Mount: hand the chat its current session's messages + the session list
  // (+ the debug preference, for the trace detail).
  const load: FunctionHandler = async () => {
    const current = store.ensureCurrent();
    return { messages: current.messages, sessions: store.sessionList(), currentId: current.id, debug: store.getDebug() };
  };

  const newSession: FunctionHandler = async () => {
    const session = store.newSession();
    return { messages: session.messages, sessions: store.sessionList(), currentId: session.id, debug: store.getDebug() };
  };

  // Switch to an existing session (id arrives in `$.currentId`, set just before).
  const switchSession: FunctionHandler = async (data) => {
    const id = String(data['currentId'] ?? '');
    const session = store.switchTo(id);
    return { messages: session.messages, sessions: store.sessionList(), currentId: session.id, debug: store.getDebug() };
  };

  return {
    'ray.run': run,
    'ray.load': load,
    'ray.newSession': newSession,
    'ray.switch': switchSession,
    // The settings screen's Ray section — the same store, server-side.
    'ray.getDebug': async () => store.getDebug(),
    'ray.setDebug': async (data) => {
      store.setDebug(data['rayDebug'] === true);
      return store.getDebug();
    },
    'ray.storageSize': async () => store.estimate(),
    'ray.clearSessions': async () => {
      store.clear();
      return 'cleared';
    },
  };
};
