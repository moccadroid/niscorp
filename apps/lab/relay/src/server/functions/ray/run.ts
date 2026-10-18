import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import type { Message } from '@niscorp/signal';
import { makeTools, type Turn } from './tools';
import { makeScreenTools } from './architect';
import { rayAgent } from './agent';
import { llmFor } from '@relay/server/llm';
import { traceWiring, type TraceStep } from './trace';
import { sessionStore, type ChatMessage } from './sessions';
import type { RayContext } from './seams';
import { intentWriters } from './writers';

// The assistant action names the same string in its trigger.
export const RAY_STEP_CHANNEL = 'ray:step';

const messagesOf = (data: Record<string, unknown>): ChatMessage[] =>
  Array.isArray(data['messages']) ? (data['messages'] as ChatMessage[]) : [];

const toTranscript = (messages: ChatMessage[]): Message[] =>
  messages.map((m): Message =>
    m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
  );

export const rayFunctions = (session: FunctionSession): FunctionDefinition[] => {
  const userId = session.principal ?? 'anonymous';
  const store = sessionStore(userId);
  const ray: RayContext = {
    // A getter: moss hands the shell just after the session finishes building.
    get shell() {
      return session.shell;
    },
    userId,
    wire: session.wire,
    answerIntent: (asked) => session.answerIntent(intentWriters(), asked),
    draft: session.draft,
    artifacts: session.artifacts,
  };
  // One set of screen tools for the session: its memory of the screens built lets `edit` work in a later message.
  const screens = makeScreenTools(ray);
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
    const tools = makeTools(ray, turn, { screens });
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
      deps: { shell: ray.shell, screens: screens.entries },
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

  const chatOf = (session: { id: string; messages: ChatMessage[] }): Record<string, unknown> => ({
    messages: session.messages,
    sessions: store.sessionList(),
    currentId: session.id,
    debug: store.getDebug(),
  });

  return [
    { id: 'ray.run', description: 'Runs one turn of the assistant over the chat so far, and answers its reply with the steps it took. Send { messages }.', execute: run },
    { id: 'ray.load', description: 'Answers the current chat, the list of chats and whether debug is on.', execute: async () => chatOf(store.ensureCurrent()) },
    { id: 'ray.newSession', description: 'Starts a new chat and makes it the current one.', execute: async () => chatOf(store.newSession()) },
    { id: 'ray.switch', description: 'Makes another chat the current one. Send { currentId }.', execute: async (data) => chatOf(store.switchTo(String(data['currentId'] ?? ''))) },
    { id: 'ray.getDebug', description: 'Answers whether the assistant’s debug view is on.', execute: async () => store.getDebug() },
    {
      id: 'ray.setDebug',
      description: 'Turns the assistant’s debug view on or off. Send { rayDebug }.',
      execute: async (data) => {
        store.setDebug(data['rayDebug'] === true);
        return store.getDebug();
      },
    },
    {
      id: 'ray.stop',
      description: 'Stops the turn that is running, if one is.',
      execute: async () => {
        const running = inFlight !== undefined;
        inFlight?.abort();
        inFlight = undefined;
        return running ? 'stopped' : 'nothing running';
      },
    },
    { id: 'ray.storageSize', description: 'Answers how much the chats of this person take up.', execute: async () => store.estimate() },
    {
      id: 'ray.clearSessions',
      description: 'Deletes every chat of this person.',
      execute: async () => {
        store.clear();
        return 'cleared';
      },
    },
  ];
};
