import { FOLLOW_UPS_MAX } from './contract';
import { z } from 'zod';
import { predecisionsIn } from './predecisions';
import type { Predecisions } from './predecisions';

// ═══════════════════════════════════════════════════════════
// THE FAKE AGENT MODEL — a scripted chat client, injected under signal's
// genuine openai-compatible adapter.
//
// The same bargain as the fake decider: everything above the client is the real
// thing. cortex assembles the prompt, runs the loop, executes the tools, feeds
// solid, validates the envelope and corrects a bad one; signal builds the
// request, reads streamed chunks, routes the turn and tears the stream down on
// abort. What is faked is only the text a model would have produced — and that
// is scripted from the pre-decisions in the request, so the fake can only ever
// say things Jev already decided or a tool just returned. It is not trying to be
// clever, and a check that needs it to MISBEHAVE swaps the script.
//
// A script is asked for ONE MOVE per model step: call a tool, or answer. It is
// handed what a model would have in front of it at that step — the conversation
// so far, this turn's pre-decisions, the operator's line, what its lookups
// returned, what it was told to correct — so a scripted run is a real
// multi-step run, not a canned reply.
//
// The chunk shape is the OpenAI streaming one: content deltas (or one tool-call
// delta), a finish, then a usage frame.
// ═══════════════════════════════════════════════════════════

export const FAKE_AGENT_MODEL = 'encore-scripted-2';

export type ScriptedTurn = {
  predecisions: Predecisions;
  line: string;
  // The conversation before this turn, oldest first, as the model received it.
  thread: { role: string; content: string }[];
  // What this run's tool calls have returned so far, oldest first.
  lookups: string[];
  // What cortex told the model to fix, oldest first. Empty on a first attempt.
  corrections: string[];
};

// An answer is sent as the model's final message verbatim — deliberately
// `unknown`, so a check can script a reply that breaks the contract.
export type ScriptedMove = { call: { name: string; args: Record<string, unknown> } } | { answer: unknown };

export type AgentScript = (turn: ScriptedTurn) => ScriptedMove;

export type SeenRequest = {
  // Every message of the request, in order, contents flattened to text.
  messages: { role: string; content: string }[];
  tools: string[];
  // The request as signal sent it — temperature, reasoning_effort, the lot.
  params: Record<string, unknown>;
};

// Mutable on purpose: one booted world, several behaviours. The checks hold
// this object and change it between sentences.
export type FakeAgentControls = {
  // Before the first byte of a step.
  latencyMs: number;
  // Between the content chunks of an answer — what makes a stream a stream,
  // and what a throttle is measured against.
  chunkMs: number;
  script?: AgentScript;
  // Every request the fake was sent, oldest first — one per MODEL STEP.
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

// ─── reading the request the way a model would ──────────────

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
    // Everything conversational AHEAD of the pre-decisions: the thread.
    thread: messages.slice(0, blockAt).filter((message) => message.role === 'user' || message.role === 'assistant'),
    lookups: after.filter((message) => message.role === 'tool').map((message) => message.content),
    corrections: after.filter((message) => message.role === 'system' && CORRECTION.test(message.content)).map((message) => message.content),
  };
};

// ─── the default script ─────────────────────────────────────

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

// An input built ONLY from pre-decisions: a row reference takes the first row
// Jev resolved for that table, a parsed field takes what the parser heard.
// Anything else is left for the operator.
const inputFor = (action: ActionLine, predecisions: Predecisions): Record<string, unknown> => {
  const input: Record<string, unknown> = {};
  const usedTables = new Set<string>();
  for (const key of action.keys) {
    if (key.shape.startsWith('row:')) {
      const table = key.shape.slice('row:'.length);
      const row = usedTables.has(table) ? undefined : predecisions.resolved.find((candidate) => candidate.table === table);
      if (row !== undefined) {
        input[key.name] = row.id;
        // One row fills ONE field of an action: a stage the sentence named is
        // not both where an act is moving from and where it is moving to.
        usedTables.add(table);
      }
      continue;
    }
    const heard = predecisions.heard[key.name];
    if (heard !== undefined) input[key.name] = heard;
  }
  return input;
};

const countOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

// What the facts amount to — counted, never interpreted. One PART per read, so
// each is a span of the answer that can be cited on its own.
const factParts = (facts: Predecisions['facts']): string[] =>
  Object.entries(facts).flatMap(([pack, reads]) => {
    const parsed = z.record(z.string(), z.unknown()).safeParse(reads);
    return parsed.success ? Object.entries(parsed.data).map(([name, rows]) => `${countOf(rows)} ${pack}.${name}`) : [];
  });

const factsLine = (parts: readonly string[]): string => (parts.length === 0 ? 'I was handed no facts for this' : `From what was read a moment ago: ${parts.join(', ')}`);

// What a scripted operator would want next. A script, not a judgement — but it
// keeps the contract's promise: nothing this thread already asked or was offered
// (ASKED), and at most two.
const FOLLOW_UPS = ['what are our options?', 'who needs to know?', 'how full is the arena?', 'which sets are exposed?', 'what did I miss?'];
const sameWords = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const followUpsFor = (asked: readonly string[]): string[] => FOLLOW_UPS.filter((next) => !asked.some((before) => sameWords(before) === sameWords(next))).slice(0, FOLLOW_UPS_MAX);

// A row's name, out of the ROWS lines ("id = Name — what it is").
const nameIn = (rows: Predecisions['rows'], id: unknown): string => {
  const line = Object.values(rows).flat().find((entry) => entry.startsWith(`${String(id)} = `));
  return line === undefined ? String(id) : (line.slice(`${String(id)} = `.length).split(' — ')[0] ?? String(id));
};

// WORDS WRITTEN FROM THE FORM BESIDE THEM. If a form on screen is a move — an
// act and a stage to take it to — the message is about THAT move, as the form
// holds it now, hand edits included. Otherwise there is only the sentence.
const fromSibling = (predecisions: Predecisions): string | undefined => {
  const move = predecisions.screen.find((card) => card.aimedAt['actId'] !== undefined && card.aimedAt['toStageId'] !== undefined);
  if (move === undefined) return undefined;
  const time = move.aimedAt['time'];
  return `${nameIn(predecisions.rows, move.aimedAt['actId'])} moves to ${nameIn(predecisions.rows, move.aimedAt['toStageId'])}${time === undefined ? '' : `, ${String(time)}`}. Please follow directions from festival crew.`;
};

// A question about whether something is FREE is the one the pre-decisions
// cannot settle — it needs the running order — so it is the scripted lookup.
const NEEDS_LOOKUP = /\b(free|clash|collide|available)\b/i;

export const defaultScript: AgentScript = (turn) => {
  const { predecisions } = turn;
  const about = predecisions.resolved.map((row) => row.label.split(' — ')[0] ?? row.label);

  if (predecisions.mode === 'write') {
    const when = predecisions.heard['time'];
    const authored = fromSibling(predecisions) ?? `${capitalise(predecisions.sentence.trim())}${when === undefined ? '' : ` — from ${String(when)}`}${about.length === 0 ? '' : `, concerning ${about.join(' and ')}`}. Please follow directions from festival crew.`;
    return {
      answer: {
        response: predecisions.writable.length === 0 ? 'Nothing on screen takes written words.' : `Drafted ${predecisions.writable.length} field(s) from your sentence, for the people who receive them.`,
        data: { fields: predecisions.writable.map((target) => ({ card: target.card, field: target.field, text: authored })) },
      },
    };
  }

  // ONE LINE about what is wrong, naming every place that is: the causes it was
  // handed, joined. A script — a model would say why they matter TOGETHER.
  if (predecisions.mode === 'brief') {
    const standing = z.array(z.object({ place: z.string(), kind: z.string() })).safeParse(predecisions.facts['standing']);
    const places = standing.success && standing.data.length > 0 ? standing.data.map((cause) => `${cause.place} (${cause.kind})`) : [predecisions.sentence];
    // Every standing place, joined as things happening AT ONCE — which is the
    // only thing a script can say about how they compound.
    return { answer: { response: places.length === 1 ? `${places[0] ?? ''} stands alone.` : `${places.slice(0, -1).join(', ')} while ${places.at(-1) ?? ''}: each makes the other harder to clear.`, data: {} } };
  }

  if (predecisions.mode === 'plan') {
    // A plan: one step per FORM among the narrowed actions, in Jev's order.
    const forms = predecisions.actions.flatMap((line) => readActionLine(line) ?? []).filter((action) => action.canvas === 'doing');
    return {
      answer: {
        response: forms.length === 0 ? 'No form applies to this; nothing to propose.' : `${forms.length} step(s)${about.length === 0 ? '' : ` for ${about.join(' and ')}`}, most consequential first. Nothing is sent until you press it.`,
        data: { steps: forms.map((action) => ({ say: `${action.title}${about.length === 0 ? '' : ` — ${about.join(', ')}`}`, actionId: action.id, input: inputFor(action, predecisions) })) },
      },
    };
  }

  // A question. One lookup when the facts cannot settle it, then the answer.
  if (NEEDS_LOOKUP.test(turn.line) && turn.lookups.length === 0) {
    return { call: { name: 'query', args: { fingerprint: 'lineup/forDay', context: JSON.stringify({ day: predecisions.heard['day'] ?? predecisions.now.day }) } } };
  }
  // TWO SENTENCES, like the contract says: what was read (and looked up), then
  // what the thread holds. The quoted turn is clipped and stripped of full stops —
  // a script must not be refused for quoting somebody else's punctuation.
  const lastSaid = (turn.thread.at(-1)?.content ?? '').replace(/[.!?"]/g, '').slice(0, 60);
  const earlier = turn.thread.length === 0 ? '' : ` Earlier in this conversation: ${turn.thread.length} message(s), the last being "${lastSaid}".`;
  const looked = turn.lookups.length === 0 ? '' : `; I looked up ${turn.lookups.length} thing(s) to be sure`;
  const parts = factParts(predecisions.facts);

  // EVERY SENTENCE STANDS ON A CARD. What is on screen is cited, part by part;
  // with nothing on screen the first view that needs no row to open is PLACED,
  // and cited — evidence is the default for an answer, not an extra.
  const views = predecisions.actions.flatMap((line) => readActionLine(line) ?? []).filter((action) => action.canvas !== 'doing' && !action.keys.some((key) => key.required));
  const placing = predecisions.screen.length === 0 && parts.length > 0 ? views[0] : undefined;
  const standing = placing === undefined ? predecisions.screen.map((card) => card.card) : [placing.id];
  const claims = standing.length === 0 ? [] : parts.map((text, index) => ({ text, card: standing[index % standing.length] ?? '' }));

  return {
    answer: {
      response: `${factsLine(parts)}${looked}.${earlier}`,
      data: { claims, followUps: followUpsFor(predecisions.asked), ...(placing === undefined ? {} : { canvases: { [placing.canvas]: [{ actionId: placing.id, input: {} }] } }) },
    },
  };
};

// ─── the wire ───────────────────────────────────────────────

const delay = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    // An aborted run must stop WAITING too — that is the point of the knobs.
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });

// An async iterable over fixed frames, written out by hand: arrow functions
// cannot be generators, and this app declares no `function`. `pauseMs` is
// waited BEFORE every frame after the first.
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

// The object signal's adapter calls `chat.completions.create(params, options)`
// on. Typed by what it IS rather than by the SDK, which signal never asks for.
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
