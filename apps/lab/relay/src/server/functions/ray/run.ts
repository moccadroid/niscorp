import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import { makeTools, type Turn } from './tools';
import { makeBuildActionTool } from './architect';
import { rayAgent } from './agent';
import { llmFor } from '@relay/server/llm';
import { traceWiring, type TraceStep } from './trace';
import { sessionStore, type ChatMessage } from './sessions';
import { rayEngine, type RayContext, type RaySeams } from './engine';
import { unverifiedShell } from '@niscorp/moss/unverified';

// The assistant action names the same string in its trigger.
export const RAY_STEP_CHANNEL = 'ray:step';

const messagesOf = (data: Record<string, unknown>): ChatMessage[] =>
  Array.isArray(data['messages']) ? (data['messages'] as ChatMessage[]) : [];

const toTranscript = (messages: ChatMessage[]): Message[] =>
  messages.map((m): Message =>
    m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
  );

export const rayFunctions = (session: FunctionSession, seams: RaySeams): Record<string, FunctionHandler> => {
  const userId = session.principal ?? 'anonymous';
  const store = sessionStore(userId);
  const ray: RayContext = {
    // A getter: moss hands the shell just after the session finishes building.
    get shell() {
      return unverifiedShell(session);
    },
    userId,
    get policy() {
      return seams.policyFor(session.roles);
    },
    engine: () => rayEngine(seams.runtime, seams.policyFor(session.roles)),
  };
  // One build tool for the session: its memory of built actions lets `edit` work in a later message.
  const buildTool = makeBuildActionTool(ray);
  let inFlight: AbortController | undefined;

  const run: FunctionHandler = async (data) => {
    const chat = llmFor('chat');
    if ('error' in chat) return { text: chat.error, trace: [], ms: 0 };

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    const startedAt = Date.now();
    const turn: Turn = {};
    const messages = messagesOf(data);

    const trace: TraceStep[] = [];
    const tools = makeTools(ray, turn, { buildTool });
    // Throttled: publishing on every event re-renders and re-flushes the whole
    // chat frame inside the agent's event path, which starves the stream until
    // the provider rejects it. The flush after the run makes the last state exact.
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
    store.setMessages(current.id, [...messages, { role: 'ray', text, trace, ms, view }]);
    return { text, trace, ms, view };
  };

  const load: FunctionHandler = async () => {
    const current = store.ensureCurrent();
    return { messages: current.messages, sessions: store.sessionList(), currentId: current.id, debug: store.getDebug() };
  };

  const newSession: FunctionHandler = async () => {
    const session = store.newSession();
    return { messages: session.messages, sessions: store.sessionList(), currentId: session.id, debug: store.getDebug() };
  };

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
    'ray.getDebug': async () => store.getDebug(),
    'ray.setDebug': async (data) => {
      store.setDebug(data['rayDebug'] === true);
      return store.getDebug();
    },
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
