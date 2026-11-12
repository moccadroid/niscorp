import type { SignalClient, Usage } from '@niscorp/cortex';
import type { MossServer, RunRecord } from '@niscorp/moss';
import { routeResponse } from '@niscorp/signal';
import type { StepRequest, StepResult } from '@niscorp/signal';
import { boot } from '../server/boot';
import type { Models } from '../server/compose';

// Each message, and the replies the chat model gives it, one a call: the last one again and again.
export type Script = Record<string, Record<string, unknown>[]>;

export const until = async (condition: () => boolean, ms = 5000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) return false;
    await new Promise((done) => setTimeout(done, 10));
  }
  return true;
};
export const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 150));

const SPENT: Usage = { inputTokens: 100, outputTokens: 10, totalTokens: 110, reported: true };

export type Scripted = { models: Models; prompts: string[]; unreachable: (is: boolean) => void };

// Offline, and the same every run: a chat model that answers each message in the run's input with its script.
export const scriptedModels = (script: Script, options: { keyless?: boolean } = {}): Scripted => {
  let unreachable = false;
  const prompts: string[] = [];
  const turns = new Map<string, number>();

  const scripted = (request: StepRequest): StepResult => {
    const user = request.messages.map((message) => (typeof message.content === 'string' ? message.content : '')).join('\n\n');
    prompts.push(user);
    if (unreachable) throw new Error('the provider did not answer');
    const message = /^MESSAGE: (.*)$/m.exec(user)?.[1] ?? '';
    const turn = turns.get(message) ?? 0;
    turns.set(message, turn + 1);
    const replies = script[message] ?? [{ cards: [] }];
    const { response = 'Scripted.', ...data } = replies[Math.min(turn, replies.length - 1)] ?? {};
    const content = JSON.stringify({ response, data });
    const base: StepResult = { content, toolCalls: [], usage: SPENT, finishReason: 'stop', raw: null };
    if (request.output === undefined) return base;
    const routed = routeResponse({ content, toolCalls: [], declared: new Set(), accept: request.output.accept, responseStrategies: [] });
    return { ...base, outcome: routed.outcome, wire: routed.wire };
  };
  const chat: SignalClient = {
    step: async (request) => scripted(request),
    stepStream: (request) => {
      const result = scripted(request);
      return (async function* () {
        yield { type: 'text' as const, text: result.content };
        yield { type: 'done' as const, result };
      })();
    },
    count: async () => 1,
    describe: () => ({ provider: 'scripted', model: 'chat', kind: 'chat', modelKnown: false, capabilities: { nativeTools: true, nativeJsonSchema: false, nativeJsonMode: true, toolsWithStructuredOutput: false, validatesToolArgs: true, manglesNestedToolArgs: false, multimodal: false, supportsEmbedding: false } }),
  };

  const models: Models = options.keyless === true ? { missing: ['GROQ_API_KEY'] } : { chat: { provider: 'scripted', model: 'chat', llm: chat, timeoutMs: 5000 }, missing: [] };
  return { models, prompts, unreachable: (is) => void (unreachable = is) };
};

type Session = Awaited<ReturnType<NonNullable<MossServer['shells']>['session']>>;
export type Shown = { id: string; action: string; data: Record<string, unknown> };

export type App = {
  server: MossServer;
  session: Session;
  runs: RunRecord[];
  // What is on a canvas, in order: the screen's cards, or the conversation's turns and cards.
  on: (canvas: 'screen' | 'talk') => Shown[];
  said: () => string;
  drawn: () => string;
  ask: (text: string) => Promise<number | undefined>;
  openScreen: (id: string) => Promise<void>;
};

// The app booted with the models given, driven as a terminal drives it: what the dock is typed, pressed and sent.
export const startApp = async (models: Models, answerWithinMs = 5000): Promise<App> => {
  const runs: RunRecord[] = [];
  const { server } = await boot({ models, runs: (run) => runs.push(run) });
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  const shell = session.shell;

  let answered = 0;
  let opened = 0;
  shell.onEndpoint((event) => {
    if (event.canvasId !== 'dock') return;
    if (event.name === 'ask') answered += 1;
    if (event.name === 'open') opened += 1;
  });

  const on = (canvas: 'screen' | 'talk'): Shown[] =>
    (shell.getState().canvases[canvas]?.stack ?? []).map((instance) => ({ id: instance.id, action: instance.definitionId, data: shell.getRuntime(instance.id)?.getData() ?? {} }));
  const dock = (): Record<string, unknown> => {
    const active = shell.getState().canvases['dock']?.active;
    return active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {});
  };
  // An input takes what is typed into it once it has been drawn.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());

  return {
    server,
    session,
    runs,
    on,
    said: () => String(dock()['error'] ?? ''),
    drawn: () => JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree())),
    // A message is answered when the line's `ask` call ends: how long that took, if it did.
    ask: async (text) => {
      draw();
      const seen = answered;
      const started = performance.now();
      session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: text });
      session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
      const done = await until(() => answered > seen, answerWithinMs);
      const took = performance.now() - started;
      await settle();
      return done ? took : undefined;
    },
    openScreen: async (id) => {
      const seen = opened;
      session.dispatch('dock', { type: 'ui:click', ref: 'screen', payload: id });
      await until(() => opened > seen);
      await settle();
    },
  };
};
