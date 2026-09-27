// ═══════════════════════════════════════════════════════════
// A scripted model provider — what the showroom talks to when the visitor has
// no API key.
//
// It is a `fetch`, not a fake client: the real OpenAI SDK, signal's real
// adapter, its stream parser, its wire router and repair, and cortex's real
// loop all run against it. Only the network is replaced. It speaks the OpenAI
// chat-completions dialect (JSON and SSE streams, tool calls) and embeddings.
//
// What it SAYS comes from scripts that pages register: a recorded reply from
// a real run where one exists (labelled "recorded"), a reply written for the
// page otherwise (labelled "scripted"). A prompt no script knows still gets a
// valid answer in the requested shape — generated from the request's own JSON
// Schema — and says plainly that it is scripted.
// ═══════════════════════════════════════════════════════════

export type ScriptedMessage = { role: string; content: string; toolCalls: readonly { name: string; args: unknown }[]; toolName?: string };

export type ScriptedRequest = {
  messages: readonly ScriptedMessage[];
  lastUser: string;
  system: string;
  // Tools the caller declared, minus signal/cortex's synthesized `respond` tool.
  tools: readonly { name: string; parameters: unknown }[];
  // The structured-output schema, if the caller asked for one (respond tool or response_format).
  schema: unknown;
  // How many tool results the conversation already holds, and how many since the last user message.
  toolResults: number;
  toolResultsSinceUser: number;
  // The latest tool result's content, parsed if it is JSON.
  lastToolResult: unknown;
  // Whether structured output is expected through the synthesized respond tool
  // (else it goes in the message content as JSON).
  viaRespondTool: boolean;
  // When the caller rejected the previous answer and asked again (cortex's
  // output retry), the correction it sent — the issues, in its words.
  correction: string | undefined;
};

export type ScriptedReply =
  | { text: string }
  | { data: unknown; text?: string }
  | { call: { name: string; args: unknown }; text?: string };

export type Script = {
  id: string;
  // 'recorded' = the words of a real model run, replayed; 'scripted' = written for the page.
  source: 'recorded' | 'scripted';
  reply: (request: ScriptedRequest) => ScriptedReply | undefined;
};

export type ScriptedEvent = { script: string; source: Script['source'] | 'generated'; at: number };

const scripts: Script[] = [];
const listeners = new Set<(event: ScriptedEvent) => void>();

/** Register a script. The latest registration with a matching reply wins. */
export const registerScript = (script: Script): void => {
  const at = scripts.findIndex((s) => s.id === script.id);
  if (at >= 0) scripts.splice(at, 1);
  scripts.unshift(script);
};

/** Hear which script answered each request — for "replayed from a recording" labels. */
export const onScriptedReply = (listener: (event: ScriptedEvent) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// ── reading the request ─────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((part) => (isRecord(part) && typeof part['text'] === 'string' ? part['text'] : '')).join('');
  return '';
};
const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

const RESPOND = 'respond';

const readRequest = (body: Record<string, unknown>): ScriptedRequest => {
  const raw = Array.isArray(body['messages']) ? body['messages'] : [];
  const messages: ScriptedMessage[] = raw.filter(isRecord).map((m) => {
    const calls = Array.isArray(m['tool_calls']) ? m['tool_calls'] : [];
    return {
      role: typeof m['role'] === 'string' ? m['role'] : 'user',
      content: text(m['content']),
      toolCalls: calls.filter(isRecord).map((c) => {
        const fn = isRecord(c['function']) ? c['function'] : {};
        return { name: typeof fn['name'] === 'string' ? fn['name'] : '', args: parseJson(typeof fn['arguments'] === 'string' ? fn['arguments'] : '{}') };
      }),
      ...(typeof m['name'] === 'string' ? { toolName: m['name'] } : {}),
    };
  });
  const declared = (Array.isArray(body['tools']) ? body['tools'] : []).filter(isRecord).map((t) => {
    const fn = isRecord(t['function']) ? t['function'] : {};
    return { name: typeof fn['name'] === 'string' ? fn['name'] : '', parameters: fn['parameters'] };
  });
  const respond = declared.find((t) => t.name === RESPOND);
  const format = isRecord(body['response_format']) ? body['response_format'] : undefined;
  // Signal states a schema one of three ways: the respond tool's parameters,
  // response_format.json_schema, or — for json_object mode — a system message
  // headed "OUTPUT SCHEMA:" carrying the JSON Schema on its next line.
  const stated = messages.find((m) => m.role === 'system' && m.content.startsWith('OUTPUT SCHEMA'));
  const statedSchema = stated === undefined ? undefined : parseJson(stated.content.slice(stated.content.indexOf('\n') + 1));
  const formatSchema = isRecord(format?.['json_schema']) ? format?.['json_schema']['schema'] : isRecord(statedSchema) ? statedSchema : format !== undefined ? {} : undefined;
  const users = messages.filter((m) => m.role === 'user');
  return {
    messages,
    lastUser: users[users.length - 1]?.content ?? '',
    system: messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n'),
    tools: declared.filter((t) => t.name !== RESPOND),
    schema: respond?.parameters ?? formatSchema,
    toolResults: messages.filter((m) => m.role === 'tool').length,
    toolResultsSinceUser: messages.slice(messages.map((m) => m.role).lastIndexOf('user') + 1).filter((m) => m.role === 'tool').length,
    lastToolResult: parseJson([...messages].reverse().find((m) => m.role === 'tool')?.content ?? ''),
    viaRespondTool: respond !== undefined,
    correction: (() => {
      const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant');
      const after = lastAssistant < 0 ? [] : messages.slice(lastAssistant + 1);
      return after.find((m) => m.role === 'system' && /invalid/i.test(m.content))?.content;
    })(),
  };
};

// ── the fallback: an answer in the requested shape ──────────────

/** A value that satisfies a JSON Schema — the shape, with obviously example contents. */
export const exampleOf = (schema: unknown, name = 'value', depth = 0): unknown => {
  if (!isRecord(schema) || depth > 6) return null;
  const pick = (key: string): unknown => (Array.isArray(schema[key]) ? schema[key][0] : undefined);
  if (schema['const'] !== undefined) return schema['const'];
  if (Array.isArray(schema['enum'])) return schema['enum'][0];
  const branch = pick('anyOf') ?? pick('oneOf') ?? pick('allOf');
  if (branch !== undefined) return exampleOf(branch, name, depth + 1);
  const type = Array.isArray(schema['type']) ? schema['type'].find((t) => t !== 'null') : schema['type'];
  if (type === 'object' || isRecord(schema['properties'])) {
    const props = isRecord(schema['properties']) ? schema['properties'] : {};
    return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, exampleOf(v, k, depth + 1)]));
  }
  if (type === 'array') return [exampleOf(schema['items'], name, depth + 1)];
  if (type === 'number') return typeof schema['minimum'] === 'number' ? schema['minimum'] : 1.5;
  if (type === 'integer') return typeof schema['minimum'] === 'number' ? schema['minimum'] : 1;
  if (type === 'boolean') return true;
  if (type === 'string') return `example ${name.replace(/_/g, ' ')}`;
  return null;
};

const FALLBACK_TEXT =
  'I’m the showroom’s scripted model, standing in because no API key is set. I only know this page’s example prompts — add a key in Signal → Settings and the same code runs against a live model.';

const fallback = (request: ScriptedRequest): ScriptedReply => {
  const tool = request.tools[0];
  if (tool !== undefined && request.toolResultsSinceUser === 0) return { call: { name: tool.name, args: exampleOf(tool.parameters) } };
  if (request.schema !== undefined) return { data: exampleOf(request.schema) };
  return { text: FALLBACK_TEXT };
};

const answer = (request: ScriptedRequest): { reply: ScriptedReply; event: ScriptedEvent } => {
  for (const script of scripts) {
    const reply = script.reply(request);
    if (reply !== undefined) return { reply, event: { script: script.id, source: script.source, at: Date.now() } };
  }
  return { reply: fallback(request), event: { script: 'fallback', source: 'generated', at: Date.now() } };
};

// ── speaking OpenAI ─────────────────────────────────────────────

type WireCall = { id: string; name: string; arguments: string };

const wireOf = (reply: ScriptedReply, request: ScriptedRequest): { content: string; calls: WireCall[] } => {
  const id = `call_${Math.random().toString(36).slice(2, 10)}`;
  if ('call' in reply) return { content: reply.text ?? '', calls: [{ id, name: reply.call.name, arguments: JSON.stringify(reply.call.args) }] };
  if ('data' in reply) {
    // Structured output travels on the channel the caller asked for: the
    // synthesized respond tool, or JSON in the message content.
    return request.viaRespondTool
      ? { content: reply.text ?? '', calls: [{ id, name: RESPOND, arguments: JSON.stringify(reply.data) }] }
      : { content: JSON.stringify(reply.data), calls: [] };
  }
  return { content: reply.text, calls: [] };
};

const usage = (request: ScriptedRequest, content: string) => {
  const prompt = Math.ceil(request.messages.reduce((n, m) => n + m.content.length, 0) / 4);
  const completion = Math.max(1, Math.ceil(content.length / 4));
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
};

const completionBody = (model: string, wire: { content: string; calls: WireCall[] }, request: ScriptedRequest) => ({
  id: `chatcmpl-scripted-${Date.now()}`,
  object: 'chat.completion',
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: wire.content === '' && wire.calls.length > 0 ? null : wire.content,
        ...(wire.calls.length > 0 ? { tool_calls: wire.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}),
      },
      finish_reason: wire.calls.length > 0 ? 'tool_calls' : 'stop',
    },
  ],
  usage: usage(request, wire.content + wire.calls.map((c) => c.arguments).join('')),
});

// Chunks by code point, never through the middle of an emoji's surrogate pair.
const pieces = (s: string, size: number): string[] => {
  const chars = Array.from(s);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''));
  return out;
};

const sse = (model: string, wire: { content: string; calls: WireCall[] }, request: ScriptedRequest, pace: number): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const id = `chatcmpl-scripted-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: Record<string, unknown>, finish: string | null, extra: Record<string, unknown> = {}) =>
    encoder.encode(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`);
  return new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const wait = (): Promise<void> => new Promise((r) => setTimeout(r, pace));
      controller.enqueue(chunk({ role: 'assistant', content: '' }, null));
      for (const part of pieces(wire.content, 5)) {
        await wait();
        controller.enqueue(chunk({ content: part }, null));
      }
      for (const [index, call] of wire.calls.entries()) {
        controller.enqueue(chunk({ tool_calls: [{ index, id: call.id, type: 'function', function: { name: call.name, arguments: '' } }] }, null));
        for (const part of pieces(call.arguments, 8)) {
          await wait();
          controller.enqueue(chunk({ tool_calls: [{ index, function: { arguments: part } }] }, null));
        }
      }
      controller.enqueue(chunk({}, wire.calls.length > 0 ? 'tool_calls' : 'stop'));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [], usage: usage(request, wire.content) })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
};

// ── embeddings: a concept map, not a model ──────────────────────
// A small hand-made map from words to topics (audio, industrial, fitness, …)
// fills the first dimensions; every word is also hashed into the rest, weakly.
// So "bluetooth earbuds" lands near "noise-cancelling headphones" and far from
// "pressure gauge calibration" — enough to show what `embed()` returns and how
// similarity ranks. Pages that show it say it is a concept map.

const DIMS = 256;
const CONCEPTS: readonly (readonly string[])[] = [
  ['headphone', 'earbud', 'bluetooth', 'wireles', 'microphone', 'mic', 'noise', 'cancelling', 'canceling', 'speaker', 'audio', 'sound', 'music', 'podcast'],
  ['industrial', 'pressure', 'gauge', 'calibration', 'sensor', 'valve', 'machine', 'pump', 'factory'],
  ['yoga', 'mat', 'stretch', 'flow', 'pilate', 'workout', 'gym', 'class', 'breath', 'studio'],
  ['recipe', 'pasta', 'pancake', 'lunch', 'cook', 'dinner', 'food', 'vegan'],
  ['hike', 'hiking', 'trail', 'weather', 'city', 'travel', 'mountain'],
  ['laptop', 'computer', 'keyboard', 'monitor', 'phone', 'tablet', 'screen'],
];
const hash = (word: string): number => {
  let h = 2166136261;
  for (let i = 0; i < word.length; i += 1) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  return CONCEPTS.length + (Math.abs(h) % (DIMS - CONCEPTS.length));
};
const stem = (w: string): string => w.replace(/(ing|ers|er|es|s)$/u, '');
export const scriptedEmbedding = (input: string): number[] => {
  const v = new Array<number>(DIMS).fill(0);
  for (const word of input.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2)) {
    const base = stem(word);
    CONCEPTS.forEach((words, topic) => {
      if (words.some((c) => base.startsWith(stem(c)) || stem(c).startsWith(base))) v[topic] = (v[topic] ?? 0) + 0.45;
    });
    const idx = hash(base);
    v[idx] = (v[idx] ?? 0) + 0.6;
  }
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
  return v.map((x) => x / norm);
};

// ── the fetch ───────────────────────────────────────────────────

const json = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

export const scriptedFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const raw = typeof init?.body === 'string' ? init.body : '{}';
  const parsed = parseJson(raw);
  const body = isRecord(parsed) ? parsed : {};
  const model = typeof body['model'] === 'string' ? body['model'] : 'scripted';

  if (url.endsWith('/embeddings')) {
    const inputs = Array.isArray(body['input']) ? body['input'].map(text) : [text(body['input'])];
    for (const l of listeners) l({ script: 'embeddings', source: 'generated', at: Date.now() });
    return json({ object: 'list', model, data: inputs.map((t, index) => ({ object: 'embedding', index, embedding: scriptedEmbedding(t) })), usage: { prompt_tokens: 0, total_tokens: 0 } });
  }

  const request = readRequest(body);
  const { reply, event } = answer(request);
  for (const l of listeners) l(event);
  const wire = wireOf(reply, request);
  // A short think before answering, so a spinner is visible and nothing looks instant-fake.
  await new Promise((r) => setTimeout(r, 250));
  if (body['stream'] === true) return new Response(sse(model, wire, request, 18), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  return json(completionBody(model, wire, request));
};
