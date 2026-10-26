import type { SignalClient, Usage } from '@niscorp/cortex';
import type { MossServer, RunRecord } from '@niscorp/moss';
import { routeResponse } from '@niscorp/signal';
import type { StepRequest, StepResult } from '@niscorp/signal';
import { z } from 'zod';
import { AREAS } from '../app/shell/areas';
import { boot } from '../server/boot';
import type { Decide, Models } from '../server/compose';
import { recordOf } from '../server/compose/record';

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

export type Scripted = {
  models: Models;
  prompts: string[];
  asked: { state: Record<string, unknown>; questions: Record<string, unknown> }[];
  likely: (ids: readonly string[]) => void;
  unreachable: (is: boolean) => void;
};

// Offline, and the same every run: a decision model that finds likely only the ids it is told to, and a chat model that
// answers each message in the run's input with its script.
export const scriptedModels = (script: Script, options: { jevFails?: boolean; keyless?: boolean } = {}): Scripted => {
  let likely: readonly string[] = [];
  let unreachable = false;
  const prompts: string[] = [];
  const asked: Scripted['asked'] = [];
  const turns = new Map<string, number>();

  const decide: Decide = async (state, questions) => {
    if (options.jevFails === true) throw new Error('Jev did not answer');
    asked.push({ state, questions });
    const answer = (instructions: string): { yes: boolean; probability: number } => (likely.some((id) => instructions.includes(`"${id}"`)) ? { yes: true, probability: 0.9 } : { yes: false, probability: 0.1 });
    return { picked: Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, answer(question.instructions)])), usage: SPENT };
  };

  const scripted = (request: StepRequest): StepResult => {
    const user = request.messages.map((message) => (typeof message.content === 'string' ? message.content : '')).join('\n\n');
    prompts.push(user);
    if (unreachable) throw new Error('the provider did not answer');
    const message = /^MESSAGE: (.*)$/m.exec(user)?.[1] ?? '';
    const turn = turns.get(message) ?? 0;
    turns.set(message, turn + 1);
    const replies = script[message] ?? [{ areas: [] }];
    const { response = 'Scripted.', ...data } = replies[Math.min(turn, replies.length - 1)] ?? {};
    const content = JSON.stringify({ response, data: { title: 'Scripted', ...data } });
    const base: StepResult = { content, toolCalls: [], usage: SPENT, finishReason: 'stop', raw: null };
    if (request.output === undefined) return base;
    const routed = routeResponse({ content, toolCalls: [], declared: new Set(), accept: request.output.accept, responseStrategies: [] });
    return { ...base, outcome: routed.outcome, wire: routed.wire };
  };
  const chat: SignalClient = {
    step: async (request) => scripted(request),
    stepStream: (request) => {
      const result = scripted(request);
      // In pieces, as a provider streams it, so the reply is read while it is written.
      return (async function* () {
        for (let at = 0; at < result.content.length; at += 24) {
          yield { type: 'text' as const, text: result.content.slice(at, at + 24) };
          await new Promise((done) => setTimeout(done, 1));
        }
        yield { type: 'done' as const, result };
      })();
    },
    count: async () => 1,
    describe: () => ({ provider: 'scripted', model: 'chat', kind: 'chat', modelKnown: false, capabilities: { nativeTools: true, nativeJsonSchema: false, nativeJsonMode: true, toolsWithStructuredOutput: false, validatesToolArgs: true, manglesNestedToolArgs: false, multimodal: false, supportsEmbedding: false } }),
  };

  const models: Models = options.keyless === true ? { missing: ['GROQ_API_KEY'] } : { jev: { provider: 'scripted', model: 'jev', decide }, chat: { provider: 'scripted', model: 'chat', llm: chat, timeoutMs: 5000 }, missing: [] };
  return { models, prompts, asked, likely: (ids) => void (likely = ids), unreachable: (is) => void (unreachable = is) };
};

const ShownSchema = z.looseObject({
  question: z.string().optional(),
  response: z.string().optional(),
  screen: z.string().optional(),
  arrangement: z.string().optional(),
  position: z.number().optional(),
  total: z.number().optional(),
  stack: z.array(z.looseObject({ position: z.number(), label: z.string() })).optional(),
});

type Session = Awaited<ReturnType<NonNullable<MossServer['shells']>['session']>>;
type Canvas = { action: string; id: string; data: Record<string, unknown> };

export type App = {
  server: MossServer;
  session: Session;
  runs: RunRecord[];
  on: (canvas: string) => Canvas;
  current: () => z.infer<typeof ShownSchema>;
  draw: () => void;
  answered: () => number;
  streamed: () => number;
  areas: () => string;
  ids: () => string;
  without: (area: string, of: string) => string;
  rows: (canvas: string, key: string) => unknown[];
  total: () => number;
  said: () => string;
  drawn: () => string;
  grid: () => string;
  marked: () => string;
  ask: (text: string) => Promise<void>;
  openScreen: (id: string) => Promise<void>;
};

// The app booted with the models given, driven as a terminal drives it: what the dock is typed, pressed and sent.
export const startApp = async (models: Models): Promise<App> => {
  const runs: RunRecord[] = [];
  const { server } = await boot({ models, runs: (run) => runs.push(run) });
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  const shell = session.shell;

  let answered = 0;
  let moves = 0;
  let movesWhenAnswered = 0;
  shell.onEndpoint((event) => {
    if (event.canvasId !== 'dock') return;
    if (event.name === 'current') moves += 1;
    if (event.name === 'ask') {
      answered += 1;
      movesWhenAnswered = moves;
    }
  });

  const on = (canvas: string): Canvas => {
    const active = shell.getState().canvases[canvas]?.active;
    return { action: active?.definitionId ?? '', id: active?.id ?? '', data: active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {}) };
  };
  const nodesOf = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(recordOf) : []);
  const named = (name: string, nodes: unknown): Record<string, unknown>[] => nodesOf(nodes).flatMap((node) => (node['name'] === name ? [node] : named(name, node['children'])));
  const current = (): z.infer<typeof ShownSchema> => ShownSchema.safeParse(on('dock').data['current']).data ?? {};
  // An input takes what is typed into it once it has been drawn.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  let streamed = 0;

  return {
    server,
    session,
    runs,
    on,
    current,
    draw,
    answered: () => answered,
    streamed: () => streamed,
    areas: () => AREAS.map((area) => on(area).action).filter((action) => action !== '').join(' '),
    ids: () => AREAS.map((area) => `${area}:${on(area).id}`).join(' '),
    without: (area, of) => of.replace(new RegExp(`${area}:\\S*`), ''),
    rows: (canvas, key) => {
      const value = on(canvas).data[key];
      return Array.isArray(value) ? value : [];
    },
    total: () => Number(current().total),
    said: () => String(on('dock').data['error'] ?? ''),
    drawn: () => JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree())),
    // The frame's `answers` region as the shell draws it: its columns, and each area's name and span.
    grid: () => {
      const answers = named('Grid', shell.getShellRenderTree())[0] ?? {};
      const held = nodesOf(answers['children']).map((area) => {
        const own = recordOf(area['props']);
        return `${String(own['name'])}${Number(own['span'] ?? 1) > 1 ? `×${String(own['span'])}` : ''}`;
      });
      return `${String(recordOf(answers['props'])['columns'])}: ${held.join(' ')}`;
    },
    marked: () =>
      named('Area', shell.getShellRenderTree())
        .map((area) => recordOf(area['props']))
        .filter((props) => props['changed'] === true)
        .map((props) => String(props['name']))
        .join(' '),
    // A message is answered when the line's `ask` call ends, whatever it leaves on screen.
    ask: async (text) => {
      draw();
      const seen = answered;
      const movesBefore = moves;
      session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: text });
      session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
      await until(() => answered > seen);
      streamed = movesWhenAnswered - movesBefore;
      await settle();
    },
    openScreen: async (id) => {
      session.dispatch('dock', { type: 'ui:click', ref: 'screen', payload: id });
      await until(() => current().screen === id);
      await settle();
    },
  };
};
