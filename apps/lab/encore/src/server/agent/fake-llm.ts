import { FOLLOW_UPS_MAX } from './contract';
import { z } from 'zod';
import { predecisionsIn } from './predecisions';
import type { Predecisions } from './predecisions';

export const FAKE_AGENT_MODEL = 'encore-scripted-2';

export type ScriptedTurn = {
  predecisions: Predecisions;
  line: string;
  thread: { role: string; content: string }[];
  lookups: string[];
  corrections: string[];
};

export type ScriptedMove = { call: { name: string; args: Record<string, unknown> } } | { answer: unknown };

export type AgentScript = (turn: ScriptedTurn) => ScriptedMove;

export type SeenRequest = {
  messages: { role: string; content: string }[];
  tools: string[];
  params: Record<string, unknown>;
};

export type FakeAgentControls = {
  latencyMs: number;
  chunkMs: number;
  script?: AgentScript;
  seen: SeenRequest[];
};

const RequestSchema = z
  .object({
    messages: z.array(z.object({ role: z.string(), content: z.unknown(), tool_call_id: z.string().optional() }).loose()),
    tools: z.array(z.object({ function: z.object({ name: z.string() }).loose() }).loose()).optional(),
  })
  .loose();

const OptionsSchema = z.object({ signal: z.instanceof(AbortSignal).optional() }).optional();

const textOf = (content: unknown): string => (typeof content === 'string' ? content : content === null || content === undefined ? '' : JSON.stringify(content));

const CORRECTION = /^(Your output was invalid|You did not finish)/;

const turnIn = (messages: readonly { role: string; content: string }[]): ScriptedTurn => {
  const lineAt = messages.map((message) => message.role === 'user').lastIndexOf(true);
  const blockAt = messages.map((message, index) => index < lineAt && message.role === 'system' && predecisionsIn(message.content) !== undefined).lastIndexOf(true);
  const predecisions = blockAt < 0 ? undefined : predecisionsIn(messages[blockAt]?.content ?? '');
  if (lineAt < 0 || predecisions === undefined) throw new Error('fake agent: the request carries no pre-decisions block before the operator’s line');
  const after = messages.slice(lineAt + 1);
  return {
    predecisions,
    line: messages[lineAt]?.content ?? '',
    thread: messages.slice(0, blockAt).filter((message) => message.role === 'user' || message.role === 'assistant'),
    lookups: after.filter((message) => message.role === 'tool').map((message) => message.content),
    corrections: after.filter((message) => message.role === 'system' && CORRECTION.test(message.content)).map((message) => message.content),
  };
};

const capitalise = (text: string): string => (text === '' ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`);

const ACTION_LINE = /^(\S+) \[(\w+)\] (.+?) — /;
const INPUT_KEYS = / · input: (.+)$/;
const INPUT_KEY = /^(\w+)(\*?)\((.+)\)$/;

type ActionLine = { id: string; canvas: string; title: string; keys: { name: string; shape: string; required: boolean }[] };

const readActionLine = (line: string): ActionLine | undefined => {
  const head = ACTION_LINE.exec(line);
  if (head === null) return undefined;
  const keys = (INPUT_KEYS.exec(line)?.[1] ?? '')
    .split(', ')
    .map((key) => INPUT_KEY.exec(key))
    .flatMap((match) => (match === null ? [] : [{ name: match[1] ?? '', required: match[2] === '*', shape: match[3] ?? '' }]));
  return { id: head[1] ?? '', canvas: head[2] ?? '', title: head[3] ?? '', keys };
};

const countOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const factParts = (facts: Predecisions['facts']): string[] =>
  Object.entries(facts).flatMap(([pack, reads]) => {
    const parsed = z.record(z.string(), z.unknown()).safeParse(reads);
    return parsed.success ? Object.entries(parsed.data).map(([name, rows]) => `${countOf(rows)} ${pack}.${name}`) : [];
  });

const ROW_ID: Record<string, string> = { acts: 'act_id', stages: 'stage_id', zones: 'zone_id' };
const firstRowWith = (facts: Predecisions['facts'], key: string): string | undefined => {
  for (const reads of Object.values(facts)) {
    for (const rows of Object.values(z.record(z.string(), z.unknown()).catch({}).parse(reads))) {
      const found = z.array(z.record(z.string(), z.unknown())).catch([]).parse(rows).map((row) => row[key]).find((value) => typeof value === 'string' && value !== '');
      if (typeof found === 'string') return found;
    }
  }
  return undefined;
};
const aimWanted = (predecisions: Predecisions): { canvas: string; actionId: string; input: Record<string, unknown> }[] =>
  predecisions.wanted.slice(0, 1).flatMap((line) => {
    const action = predecisions.actions.flatMap((entry) => readActionLine(entry) ?? []).find((entry) => line.startsWith(`${entry.id} — `));
    const rowKeys = action?.keys.filter((entry) => entry.required && entry.shape.startsWith('row:')) ?? [];
    const key = rowKeys.length === 1 ? rowKeys[0] : undefined;
    const id = key === undefined ? undefined : firstRowWith(predecisions.facts, ROW_ID[key.shape.slice('row:'.length)] ?? '');
    return action === undefined || key === undefined || id === undefined ? [] : [{ canvas: action.canvas, actionId: action.id, input: { [key.name]: id } }];
  });

const factsLine = (parts: readonly string[]): string => (parts.length === 0 ? 'I was handed no facts for this' : `From what was read a moment ago: ${parts.join(', ')}`);

const FOLLOW_UPS = ['what are our options?', 'who needs to know?', 'how full is the arena?', 'which sets are exposed?', 'what did I miss?'];
const sameWords = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const followUpsFor = (asked: readonly string[]): string[] => FOLLOW_UPS.filter((next) => !asked.some((before) => sameWords(before) === sameWords(next))).slice(0, FOLLOW_UPS_MAX);

const nameIn = (rows: Predecisions['rows'], id: unknown): string => {
  const line = Object.values(rows).flat().find((entry) => entry.startsWith(`${String(id)} = `));
  return line === undefined ? String(id) : (line.slice(`${String(id)} = `.length).split(' — ')[0] ?? String(id));
};

const fromSibling = (predecisions: Predecisions): string | undefined => {
  const move = predecisions.screen.find((card) => card.aimedAt['actId'] !== undefined && card.aimedAt['toStageId'] !== undefined);
  if (move === undefined) return undefined;
  const time = move.aimedAt['time'];
  return `${nameIn(predecisions.rows, move.aimedAt['actId'])} moves to ${nameIn(predecisions.rows, move.aimedAt['toStageId'])}${time === undefined ? '' : `, ${String(time)}`}. Please follow directions from festival crew.`;
};

const canvasesOf = (cards: readonly { canvas: string; actionId: string; input: Record<string, unknown> }[]): { canvases?: Record<string, { actionId: string; input: Record<string, unknown> }[]> } => {
  if (cards.length === 0) return {};
  const canvases: Record<string, { actionId: string; input: Record<string, unknown> }[]> = {};
  for (const card of cards) canvases[card.canvas] = [...(canvases[card.canvas] ?? []), { actionId: card.actionId, input: card.input }];
  return { canvases };
};

export const defaultScript: AgentScript = (turn) => {
  const { predecisions } = turn;
  const about = predecisions.resolved.map((row) => row.label.split(' — ')[0] ?? row.label);

  const standing = z.array(z.object({ place: z.string(), kind: z.string() })).safeParse(predecisions.facts['standing']);
  if (standing.success) {
    const places = standing.data.length > 0 ? standing.data.map((cause) => `${cause.place} (${cause.kind})`) : [predecisions.sentence];
    return { answer: { response: places.length === 1 ? `${places[0] ?? ''} stands alone.` : `${places.slice(0, -1).join(', ')} while ${places.at(-1) ?? ''}: each makes the other harder to clear.`, data: {} } };
  }

  const when = predecisions.heard['time'];
  const authored = fromSibling(predecisions) ?? `${capitalise(predecisions.sentence.trim())}${when === undefined ? '' : ` — from ${String(when)}`}${about.length === 0 ? '' : `, concerning ${about.join(' and ')}`}. Please follow directions from festival crew.`;
  const fields = predecisions.writable.map((target) => ({ card: target.card, field: target.field, text: authored }));

  const parts = factParts(predecisions.facts);
  const views = predecisions.actions.flatMap((line) => readActionLine(line) ?? []).filter((action) => action.canvas !== 'doing' && !action.keys.some((key) => key.required));
  const placing = predecisions.screen.length === 0 && parts.length > 0 ? views[0] : undefined;
  const cited = placing === undefined ? predecisions.screen.map((card) => card.card) : [placing.id];
  const claims = cited.length === 0 ? [] : parts.map((text, index) => ({ text, card: cited[index % cited.length] ?? '' }));
  const cards = canvasesOf([...(placing === undefined ? [] : [{ canvas: placing.canvas, actionId: placing.id, input: {} }]), ...aimWanted(predecisions)]);

  if (fields.length > 0) return { answer: { response: `Drafted ${fields.length} field(s) from your sentence, for the people who receive them.`, data: { fields, ...cards } } };
  if (parts.length === 0) return { answer: { response: '', data: cards } };

  const lastSaid = (turn.thread.at(-1)?.content ?? '').replace(/[.!?"]/g, '').slice(0, 60);
  const earlier = turn.thread.length === 0 ? '' : ` Earlier in this conversation: ${turn.thread.length} message(s), the last being "${lastSaid}".`;
  return { answer: { response: `${factsLine(parts)}.${earlier}`, data: { claims, followUps: followUpsFor(predecisions.asked), ...cards } } };
};

const delay = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });

// By hand: arrow functions cannot be generators, and this app declares no `function`.
const framesOf = (frames: readonly unknown[], pauseMs: number, signal: AbortSignal | undefined): AsyncIterable<unknown> => ({
  [Symbol.asyncIterator]: () => {
    let index = 0;
    return {
      next: async (): Promise<IteratorResult<unknown>> => {
        if (index >= frames.length) return { value: undefined, done: true };
        if (index > 0 && pauseMs > 0) await delay(pauseMs, signal);
        const frame = frames[index];
        index += 1;
        return { value: frame, done: false };
      },
    };
  },
});

const CHUNKS = 8;

const chunksOf = (content: string): string[] => {
  const size = Math.max(1, Math.ceil(content.length / CHUNKS));
  return Array.from({ length: Math.ceil(content.length / size) }, (_, index) => content.slice(index * size, (index + 1) * size));
};

export type ScriptedClient = { chat: { completions: { create: (params: unknown, options?: unknown) => Promise<AsyncIterable<unknown>> } } };

export const createScriptedClient = (controls: FakeAgentControls): ScriptedClient => {
  let calls = 0;
  return {
    chat: {
      completions: {
        create: async (params, options) => {
          const request = RequestSchema.parse(params);
          const messages = request.messages.map((message) => ({ role: message.role, content: textOf(message.content) }));
          controls.seen.push({ messages, tools: (request.tools ?? []).map((tool) => tool.function.name), params: request });
          const signal = OptionsSchema.parse(options)?.signal;
          if (controls.latencyMs > 0) await delay(controls.latencyMs, signal);

          const move = (controls.script ?? defaultScript)(turnIn(messages));
          const promptTokens = Math.ceil(JSON.stringify(params).length / 4);
          const usage = (completion: string): unknown => {
            const completionTokens = Math.ceil(completion.length / 4);
            return { choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } };
          };

          if ('call' in move) {
            calls += 1;
            const args = JSON.stringify(move.call.args);
            return framesOf([{ choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${calls}`, function: { name: move.call.name, arguments: args } }] } }] }, { choices: [{ finish_reason: 'tool_calls' }] }, usage(args)], 0, signal);
          }

          const content = typeof move.answer === 'string' ? move.answer : JSON.stringify(move.answer);
          return framesOf([...chunksOf(content).map((text) => ({ choices: [{ delta: { content: text } }] })), { choices: [{ finish_reason: 'stop' }] }, usage(content)], controls.chunkMs, signal);
        },
      },
    },
  };
};
