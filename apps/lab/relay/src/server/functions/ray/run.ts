import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import { makeTools, type Turn } from './tools';
import { makeBuildActionTool } from './architect';
import { rayAgent } from './agent';
import { llmFor } from '@relay/server/llm';
import { traceWiring, type TraceStep } from './trace';
import { sessionStore, type ChatMessage } from './sessions';
import { rayEngine, type RayContext } from './engine';

// The channel the chat's live trace listens on. Named here because the server
// is what announces on it; the action names the same string in its trigger.
export const RAY_STEP_CHANNEL = 'ray:step';

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
  // ONE build tool for the session: its builtActions memory is what makes
  // `edit` work across messages ("change the screen you built" is almost
  // always a later message).
  const buildTool = makeBuildActionTool(ray);
  // THE STOP. A build can run for minutes, and until now the only way out was
  // restarting the server — a runaway turn held the panel hostage. Cortex runs
  // take an AbortSignal; this holds the controller for whatever turn is in
  // flight so `ray.stop` can pull it. One per session: a person has one
  // conversation, and the turn they can see is the turn they can stop.
  let inFlight: AbortController | undefined;

  const run: FunctionHandler = async (data) => {
    const chat = llmFor('chat');
    if ('error' in chat) return { text: chat.error, trace: [], ms: 0 };

    // A new turn supersedes an unfinished one — the old run is nobody's
    // answer once a person has typed the next thing.
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    const startedAt = Date.now();
    const turn: Turn = {};
    const messages = messagesOf(data);

    // Always capture the trace — tool calls are shown in the chat regardless of
    // the debug toggle (which only governs the expandable JSON detail).
    const trace: TraceStep[] = [];
    const tools = makeTools(ray, turn, { buildTool });
    // Announce the trace as it fills — THROTTLED. Publishing on every event
    // re-rendered and re-flushed the whole chat frame inside the agent's event
    // path; measured on one build: 21s plain vs 64-83s with per-event
    // announces, plus stream starvation that turned into provider rejections.
    // A trailing 400ms timer keeps the panel live (2-3 updates/s) at none of
    // that cost; the final flush after the run makes the last state exact.
    let pending: TraceStep[] | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const announce = (steps: TraceStep[]): void => {
      pending = steps;
      timer ??= setTimeout(() => {
        timer = undefined;
        if (pending !== undefined) ray.shell.publish(RAY_STEP_CHANNEL, pending);
        pending = undefined;
      }, 400);
    };
    const flushTrace = (): void => {
      if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
      if (pending !== undefined) ray.shell.publish(RAY_STEP_CHANNEL, pending);
      pending = undefined;
    };
    const wiring = traceWiring(tools, trace, announce);
    const result = await rayAgent.run(toTranscript(messages), {
      llm: chat.llm,
      deps: { shell: ray.shell },
      tools,
      onEvent: wiring.onEvent,
      onToolResult: [wiring.onToolResult],
      signal: controller.signal,
    }).result;
    flushTrace();
    if (inFlight === controller) inFlight = undefined;

    // STOPPED IS AN ANSWER, NOT AN ERROR. The person asked for it, the trace
    // they watched is real work, and it belongs in the transcript with what
    // it got through — not thrown away as a failure.
    if (!result.ok && controller.signal.aborted) {
      const current = store.ensureCurrent();
      const ms = Date.now() - startedAt;
      const text = 'Stopped.';
      store.setMessages(current.id, [...messages, { role: 'ray', text, trace, ms }]);
      return { text, trace, ms };
    }
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
    // Pull the in-flight turn's abort. Idempotent and safe when nothing is
    // running: a stop pressed twice, or after the answer landed, is a no-op.
    'ray.stop': async () => {
      const running = inFlight !== undefined;
      inFlight?.abort();
      inFlight = undefined;
      return running ? 'stopped' : 'nothing running';
    },
    'ray.storageSize': async () => store.estimate(),
    'ray.clearSessions': async () => {
      store.clear();
      return 'cleared';
    },
  };
};
