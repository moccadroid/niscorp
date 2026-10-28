import type { SignalClient, Usage } from '@niscorp/cortex';
import type { MossServer, RunRecord, RunSink } from '@niscorp/moss';
import { routeResponse } from '@niscorp/signal';
import type { StepRequest, StepResult } from '@niscorp/signal';
import { z } from 'zod';
import { boot } from '../server/boot';
import type { BootConfig } from '../server/boot';
import type { Models } from '../server/compose';
import { recordOf } from '../server/compose/record';
import type { SendMail } from '../server/identity';

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
  unreachable: (is: boolean) => void;
};

// Offline, and the same every run: a chat model that answers each message in the run's input with its script.
export const scriptedModels = (script: Script, options: { keyless?: boolean } = {}): Scripted => {
  let unreachable = false;
  const prompts: string[] = [];
  const turns = new Map<string, number>();

  const scripted = (request: StepRequest): StepResult => {
    const user = request.messages.map((message) => (typeof message.content === 'string' ? message.content : '')).join('\n\n');
    prompts.push(user);
    if (unreachable) throw new Error('the provider did not answer');
    // The message is the person's last one the script knows: a correction cortex sends after it is not.
    const message = [...request.messages].reverse().flatMap((sent) => (sent.role === 'user' && typeof sent.content === 'string' && sent.content in script ? [sent.content] : []))[0] ?? '';
    const turn = turns.get(message) ?? 0;
    turns.set(message, turn + 1);
    const replies = script[message] ?? [{ cards: [] }];
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

  const models: Models = options.keyless === true ? { missing: ['GROQ_API_KEY'] } : { chat: { provider: 'scripted', model: 'chat', llm: chat, timeoutMs: 5000 }, missing: [] };
  return { models, prompts, unreachable: (is) => void (unreachable = is) };
};

const ShownSchema = z.looseObject({
  question: z.string().optional(),
  response: z.string().optional(),
  screen: z.string().optional(),
  columns: z.number().optional(),
  position: z.number().optional(),
  total: z.number().optional(),
  stack: z.array(z.looseObject({ position: z.number(), label: z.string() })).optional(),
  ink: z.string().optional(),
  next: z.string().optional(),
});

type Session = Awaited<ReturnType<NonNullable<MossServer['shells']>['session']>>;
type Canvas = { action: string; id: string; data: Record<string, unknown> };

export type App = {
  server: MossServer;
  token: string;
  session: Session;
  runs: RunRecord[];
  on: (canvas: string) => Canvas;
  cards: () => Canvas[];
  card: (place: number) => Canvas;
  current: () => z.infer<typeof ShownSchema>;
  draw: () => void;
  answered: () => number;
  streamed: () => number;
  areas: () => string;
  ids: () => string;
  without: (place: number, of: string) => string;
  rows: (canvas: string, key: string) => unknown[];
  total: () => number;
  said: () => string;
  drawn: () => string;
  grid: () => string;
  marked: () => string;
  inks: () => string;
  ask: (text: string) => Promise<void>;
  openScreen: (id: string) => Promise<void>;
};

export const OWNER = 'owner@mira.test';

// On PGlite, its owner let in; every mail goes to `mail`.
export const offline = (models: Models, runs: RunSink, mail: SendMail = async () => undefined): BootConfig => ({ models, runs, mail, owner: OWNER, publicUrl: 'http://mira.test', databaseUrl: '' });

// The app booted with the models given, driven as a terminal drives it, signed in as its owner: what the dock is typed,
// pressed and sent.
export const startApp = async (models: Models): Promise<App> => {
  const runs: RunRecord[] = [];
  const { server, door } = await boot(offline(models, (run) => runs.push(run)));
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const token = await door.signIn(OWNER);
  if (token === null) throw new Error('the owner was not let in');
  const session = await shells.session(token, await server.principalOf(token));
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
  // The cards of the answer shown: the screen canvas's instances, in order.
  const cards = (): Canvas[] => (shell.getState().canvases['screen']?.stack ?? []).map((instance) => ({ action: instance.definitionId, id: instance.id, data: shell.getRuntime(instance.id)?.getData() ?? {} }));
  const card = (place: number): Canvas => cards()[place - 1] ?? { action: '', id: '', data: {} };
  const screenTree = (): unknown => shell.getCanvasRenderTree('screen');
  const nodesOf = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(recordOf) : []);
  const named = (name: string, nodes: unknown): Record<string, unknown>[] => nodesOf(nodes).flatMap((node) => (node['name'] === name ? [node] : named(name, node['children'])));
  const current = (): z.infer<typeof ShownSchema> => ShownSchema.safeParse(on('dock').data['current']).data ?? {};
  // An input takes what is typed into it once it has been drawn.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  let streamed = 0;

  return {
    server,
    token,
    session,
    runs,
    on,
    cards,
    card,
    current,
    draw,
    answered: () => answered,
    streamed: () => streamed,
    areas: () => cards().map((held) => held.action).join(' '),
    ids: () => cards().map((held, at) => `${String(at + 1)}:${held.id}`).join(' '),
    without: (place, of) => of.replace(new RegExp(`(^| )${String(place)}:\\S*`), ''),
    rows: (canvas, key) => {
      const value = on(canvas).data[key];
      return Array.isArray(value) ? value : [];
    },
    total: () => Number(current().total),
    said: () => String(on('dock').data['error'] ?? ''),
    drawn: () => JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree())),
    // The screen canvas as the shell draws it: its columns, and each area's name and span.
    grid: () => {
      const answers = named('Grid', screenTree())[0] ?? {};
      const held = nodesOf(answers['children']).map((area) => {
        const own = recordOf(area['props']);
        return `${String(own['name'])}${Number(own['span'] ?? 1) > 1 ? `×${String(own['span'])}` : ''}`;
      });
      return `${String(recordOf(answers['props'])['columns'])}: ${held.join(' ')}`;
    },
    marked: () =>
      named('Area', screenTree())
        .map((area) => recordOf(area['props']))
        .filter((props) => props['fresh'] !== undefined)
        .map((props) => `${String(props['name'])}:${String(props['fresh'])}`)
        .join(' '),
    inks: () =>
      named('Area', screenTree())
        .map((area) => recordOf(area['props']))
        .map((props) => `${String(props['name'])}:${String(props['ink'])}`)
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
