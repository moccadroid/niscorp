import type { SignalClient, Usage } from '@niscorp/cortex';
import type { RunRecord } from '@niscorp/moss';
import { routeResponse } from '@niscorp/signal';
import type { StepRequest, StepResult } from '@niscorp/signal';
import { z } from 'zod';
import { AREAS } from '../app/shell/areas';
import { boot } from '../server/boot';
import type { Decide, Models } from '../server/compose';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const recordOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

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

export const checks = (name: string): { check: (what: string, passed: boolean, detail?: string) => void; finish: () => never } => {
  let failures = 0;
  return {
    check: (what, passed, detail = '') => {
      console.log(`${passed ? '[pass]' : '[fail]'} ${what}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
      if (!passed) failures += 1;
    },
    finish: () => {
      console.log(failures === 0 ? `[pass] ${name}: all checks passed` : `[fail] ${name}: ${failures} check(s) failed`);
      process.exit(failures === 0 ? 0 : 1);
    },
  };
};

const SPENT: Usage = { inputTokens: 100, outputTokens: 10, totalTokens: 110, reported: true };

const ShownSchema = z.looseObject({
  question: z.string().optional(),
  response: z.string().optional(),
  screen: z.string().optional(),
  arrangement: z.string().optional(),
  position: z.number().optional(),
  total: z.number().optional(),
  stack: z.array(z.looseObject({ position: z.number(), label: z.string() })).optional(),
});

type Options = { jevFails?: boolean; keyless?: boolean };

// The app booted offline, the same every run: a decision model that finds likely only the ids it is told to, and a
// chat model scripted as relay's checks script one. Whatever drives the shell is the dock's own: what it types, presses
// and is sent.
export const startApp = async (script: Script, options: Options = {}) => {
  let likely: readonly string[] = [];
  let unreachable = false;
  const prompts: string[] = [];
  const asked: { state: Record<string, unknown>; questions: Record<string, unknown> }[] = [];
  const runs: RunRecord[] = [];
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

  const models: Models = options.keyless
    ? { missing: ['GROQ_API_KEY'] }
    : { jev: { provider: 'scripted', model: 'jev', decide }, chat: { provider: 'scripted', model: 'chat', llm: chat, timeoutMs: 5000 }, missing: [] };
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

  const on = (canvas: string): { action: string; id: string; data: Record<string, unknown> } => {
    const active = shell.getState().canvases[canvas]?.active;
    return { action: active?.definitionId ?? '', id: active?.id ?? '', data: active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {}) };
  };
  const nodesOf = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(recordOf) : []);
  const named = (name: string, nodes: unknown): Record<string, unknown>[] => nodesOf(nodes).flatMap((node) => (node['name'] === name ? [node] : named(name, node['children'])));
  const current = (): z.infer<typeof ShownSchema> => ShownSchema.safeParse(on('dock').data['current']).data ?? {};
  // What a terminal does whenever the screen changes: draw every action on it. An input takes what is typed into it
  // once it has been drawn.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  let streamed = 0;

  return {
    server,
    session,
    prompts,
    asked,
    runs,
    likely: (ids: readonly string[]): void => void (likely = ids),
    unreachable: (is: boolean): void => void (unreachable = is),
    on,
    current,
    draw,
    answered: (): number => answered,
    streamed: (): number => streamed,
    lastPrompt: (): string => prompts[prompts.length - 1] ?? '',
    areas: (): string => AREAS.map((area) => on(area).action).filter((action) => action !== '').join(' '),
    ids: (): string => AREAS.map((area) => `${area}:${on(area).id}`).join(' '),
    without: (area: string, of: string): string => of.replace(new RegExp(`${area}:\\S*`), ''),
    rows: (canvas: string, key: string): unknown[] => {
      const value = on(canvas).data[key];
      return Array.isArray(value) ? value : [];
    },
    total: (): number => Number(current().total),
    said: (): string => String(on('dock').data['error'] ?? ''),
    drawn: (): string => JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree())),
    // The grid the frame's `answers` region holds, as the shell draws it: its columns, and each area's name and span.
    grid: (): string => {
      const answers = named('Grid', shell.getShellRenderTree())[0] ?? {};
      const held = nodesOf(answers['children']).map((area) => {
        const own = recordOf(area['props']);
        return `${String(own['name'])}${Number(own['span'] ?? 1) > 1 ? `×${String(own['span'])}` : ''}`;
      });
      return `${String(recordOf(answers['props'])['columns'])}: ${held.join(' ')}`;
    },
    // The areas the layout on screen marks as changed by the last answer.
    marked: (): string =>
      named('Area', shell.getShellRenderTree())
        .map((area) => recordOf(area['props']))
        .filter((props) => props['changed'] === true)
        .map((props) => String(props['name']))
        .join(' '),
    // A message is answered when the line's `ask` call ends, whatever it leaves on screen.
    ask: async (text: string): Promise<void> => {
      draw();
      const seen = answered;
      const movesBefore = moves;
      session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: text });
      session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
      await until(() => answered > seen);
      streamed = movesWhenAnswered - movesBefore;
      await settle();
    },
    openScreen: async (id: string): Promise<void> => {
      session.dispatch('dock', { type: 'ui:click', ref: 'screen', payload: id });
      await until(() => current().screen === id);
      await settle();
    },
  };
};
