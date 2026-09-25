// ═══════════════════════════════════════════════════════════
// PROBE A MODEL — measure what one model does on one provider, and print its
// row for `modelRegistry` (src/registry.ts).
//
//   tsx --env-file=.env scripts/probe-model.ts groq qwen/qwen3.8-27b
//
// A registry row is pasted from this output, never typed: every field below is
// a request made against the live API today, and the evidence is printed above
// the row so a reviewer can check one against the other.
//
// It talks to the endpoint with plain fetch, not through signal — it measures
// the API, not our client. OpenAI-compatible providers only.
//
// What it cannot see, it says: an inconclusive measurement resolves to the
// conservative value and is marked `// INCONCLUSIVE` on the row.
// ═══════════════════════════════════════════════════════════

import { crc32, deflateSync } from 'node:zlib';
import { z } from 'zod';
import { chatProviderEntry, modelKey } from '../src/registry';
import { REASONING_EFFORTS, type ReasoningEffort } from '../src/types';

const [providerId, model] = process.argv.slice(2);
if (providerId === undefined || model === undefined) throw new Error('usage: probe-model <provider> <model>');

const provider = chatProviderEntry(providerId);
if (provider === undefined || provider.adapter !== 'openai-compatible') throw new Error(`probe-model: "${providerId}" is not an openai-compatible provider in the registry`);
const apiKey = process.env[provider.envKey];
if (apiKey === undefined || apiKey === '') throw new Error(`probe-model: ${provider.envKey} is not set`);

const headers = { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };

type Reply = { status: number; body: unknown };

const post = async (body: Record<string, unknown>): Promise<Reply> => {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, ...body }) });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
};

// Providers disagree on `code`: Groq sends a string, OpenAI `null`, OpenRouter a number.
const ErrorBody = z.object({ error: z.object({ message: z.string().nullish(), code: z.union([z.string(), z.number()]).nullish(), failed_generation: z.string().nullish() }).loose() }).loose();
const Completion = z
  .object({
    choices: z.array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z.array(z.object({ function: z.object({ name: z.string(), arguments: z.string() }) })).nullish(),
        }),
      }),
    ),
  })
  .loose();

const errorOf = (reply: Reply): string => {
  const parsed = ErrorBody.safeParse(reply.body);
  return parsed.success ? `${parsed.data.error.code ?? ''} ${parsed.data.error.message ?? ''}`.trim().slice(0, 140) : String(reply.body).slice(0, 140);
};

const evidence: string[] = [];
const note = (line: string): void => {
  evidence.push(line);
  console.log(`  ${line}`);
};

// ─── served at all ───────────────────────────────────────────

const ModelList = z.object({ data: z.array(z.object({ id: z.string() }).loose()) }).loose();
const listed = await fetch(`${provider.baseUrl}/models`, { headers });
const list = ModelList.safeParse(await listed.json());
if (!list.success) throw new Error(`probe-model: ${providerId} /models did not parse`);
if (!list.data.data.some((entry) => entry.id === model)) throw new Error(`probe-model: ${providerId} does not serve "${model}" today (not in /models)`);
console.log(`\n${providerId} · ${model} — served\n`);

// ─── reasoning efforts ───────────────────────────────────────
// Accepted = the endpoint returns 200 for it. A provider that silently IGNORES
// an effort it does not support looks identical to one that honours it; that
// is a limit of this measurement, and the row cannot claim more.

const efforts: ReasoningEffort[] = [];
for (const effort of REASONING_EFFORTS) {
  const reply = await post({ messages: [{ role: 'user', content: 'Reply with the word yes.' }], reasoning_effort: effort, max_completion_tokens: 512 });
  if (reply.status === 200) efforts.push(effort);
  note(`effort ${effort.padEnd(8)} → ${reply.status === 200 ? 'accepted' : `refused (${reply.status}: ${errorOf(reply)})`}`);
}

// ─── nested tool arguments ───────────────────────────────────
// Can the tool channel carry a NESTED payload intact? The payload is the one
// that broke it in production: a layout tree — nodes with open `props` objects
// and `children` arrays, three levels deep. Asked for with tool_choice `auto`
// and forced, TRIALS times each, because the failures are intermittent.
//
// A trial fails when EITHER
//   - a nested value arrives as a JSON string (gpt-oss on Groq, 2026-07), or
//   - the endpoint rejects the model's own attempt (Groq's tool_use_failed —
//     observed 2026-09-24: Qwen's native <tool_call> syntax on a forced deep
//     call, 2 of 4).
// Either way the tool channel cannot be trusted with a nested payload, which
// is all the capability claims. ONE failing trial is enough.

const layoutNode = (depth: number): Record<string, unknown> => ({
  type: 'object',
  properties: {
    component: { type: 'string' },
    props: { type: 'object', additionalProperties: true },
    ...(depth > 0 ? { children: { type: 'array', items: layoutNode(depth - 1) } } : {}),
  },
  required: ['component'],
});

const RENDER_TOOL = {
  type: 'function',
  function: { name: 'render', description: 'Render a layout tree.', parameters: { type: 'object', properties: { layout: layoutNode(3) }, required: ['layout'] } },
};

const RENDER_PROMPT = 'Render a card: a heading "Tonight", a list with three rows (each row a Text label and a Badge with a status), and a row of two Buttons (Move, Delay). Use the render tool.';

// A string that opens like JSON, anywhere in the tree.
const hasStringifiedJson = (value: unknown): boolean => {
  if (typeof value === 'string') return /^\s*[[{]/.test(value);
  if (Array.isArray(value)) return value.some(hasStringifiedJson);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(hasStringifiedJson);
  return false;
};

type Trial = 'clean' | 'failed' | 'no call';

const nestedTrial = async (choice: 'auto' | 'forced'): Promise<Trial> => {
  const reply = await post({
    messages: [{ role: 'user', content: RENDER_PROMPT }],
    tools: [RENDER_TOOL],
    tool_choice: choice === 'forced' ? { type: 'function', function: { name: 'render' } } : 'auto',
  });
  if (reply.status !== 200) {
    const failed = ErrorBody.safeParse(reply.body);
    if (failed.success && typeof failed.data.error.failed_generation === 'string') {
      note(`nested args (${choice}) → REJECTED server-side: ${failed.data.error.failed_generation.replace(/\s+/g, ' ').slice(0, 100)}`);
      return 'failed';
    }
    note(`nested args (${choice}) → ${reply.status}: ${errorOf(reply)}`);
    return 'no call';
  }
  const completion = Completion.safeParse(reply.body);
  const call = completion.success ? completion.data.choices[0]?.message.tool_calls?.[0] : undefined;
  if (call === undefined) {
    note(`nested args (${choice}) → no tool call came back`);
    return 'no call';
  }
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    note(`nested args (${choice}) → arguments are not JSON: ${call.function.arguments.slice(0, 100)}`);
    return 'failed';
  }
  const stringified = hasStringifiedJson(args);
  note(`nested args (${choice}) → ${stringified ? 'STRINGIFIED' : 'clean'}: ${call.function.arguments.slice(0, 90)}`);
  return stringified ? 'failed' : 'clean';
};

const NESTED_TRIALS = 10;
const nested: Trial[] = [];
for (const choice of ['auto', 'forced'] as const) {
  for (let trial = 0; trial < NESTED_TRIALS; trial += 1) nested.push(await nestedTrial(choice));
}
const nestedInconclusive = !nested.includes('clean') && !nested.includes('failed');
const mangles = nestedInconclusive || nested.includes('failed');

// ─── tools + response_format in one request ──────────────────

const ENVELOPE_SCHEMA = {
  type: 'object',
  properties: {
    response: { type: 'string' },
    data: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { say: { type: 'string' }, actionId: { type: 'string' } }, required: ['say', 'actionId'] } } }, required: ['steps'] },
  },
  required: ['response', 'data'],
};
// signal's `native` transport sends strict:false (transport/resolve.ts), so
// that is what is measured.
const RESPONSE_FORMAT = { type: 'json_schema', json_schema: { name: 'envelope', strict: false, schema: ENVELOPE_SCHEMA } };

const combined = await post({ messages: [{ role: 'user', content: 'Give a two-step plan to move a concert indoors.' }], tools: [RENDER_TOOL], response_format: RESPONSE_FORMAT });
const toolsWithStructuredOutput = combined.status === 200;
note(`tools + response_format → ${combined.status === 200 ? 'accepted' : `refused (${combined.status}: ${errorOf(combined)})`}`);

// ─── json_schema: does the grammar keep the CONTENT? ─────────
// Fitting the schema is not enough. Measured 2026-09-24: Qwen 3.8 on Groq,
// under json_schema, returned carbonara recipes that FIT — with an empty
// ingredient list, an amount of "—", and once control characters for an
// amount and potatoes in the steps — while the same model and prompt through
// the content channel (emit) wrote a proper recipe three times of three. A
// model whose answers get worse under the grammar must not be sent there.
//
// So the task is content-rich and the bar is content: every trial must parse,
// fit, carry no control characters, and hold at least three ingredients (each
// with an item and an amount) and three real steps. ALL trials must hold.

const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: 'integer' },
    ingredients: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, amount: { type: 'string', description: 'Quantity with unit, e.g. "2 cups".' } }, required: ['item', 'amount'] } },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'servings', 'ingredients', 'steps'],
};

const Recipe = z.object({
  title: z.string().trim().min(1),
  servings: z.number().int().positive(),
  ingredients: z.array(z.object({ item: z.string().trim().min(1), amount: z.string().trim().min(1) })).min(3),
  steps: z.array(z.string().trim().min(15)).min(3),
});

// C0 control characters other than tab, newline and carriage return.
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

const SCHEMA_TRIALS = 3;
let schemaHeld = 0;
for (let trial = 0; trial < SCHEMA_TRIALS; trial += 1) {
  const reply = await post({
    messages: [{ role: 'user', content: 'Give me a recipe for classic spaghetti carbonara for 2 people.' }],
    response_format: { type: 'json_schema', json_schema: { name: 'recipe', strict: false, schema: RECIPE_SCHEMA } },
  });
  if (reply.status !== 200) {
    note(`json_schema → refused (${reply.status}: ${errorOf(reply)})`);
    continue;
  }
  const completion = Completion.safeParse(reply.body);
  const content = completion.success ? (completion.data.choices[0]?.message.content ?? '') : '';
  let verdict = 'holds';
  if (CONTROL_CHARACTER.test(content)) verdict = 'CONTROL CHARACTERS';
  else {
    try {
      const recipe = Recipe.safeParse(JSON.parse(content));
      if (!recipe.success) verdict = `THIN: ${recipe.error.issues.map((issue) => issue.path.join('.')).join(', ')}`;
    } catch {
      verdict = 'NOT JSON';
    }
  }
  if (verdict === 'holds') schemaHeld += 1;
  note(`json_schema → ${verdict}: ${content.replace(/\s+/g, ' ').slice(0, 90)}`);
}
const nativeJsonSchema = schemaHeld === SCHEMA_TRIALS;

// ─── image input ─────────────────────────────────────────────

// A 64×64 solid red PNG, built here rather than pasted: providers refuse tiny
// images (Groq: "at least 32 pixels in each dimension"), and a refusal for size
// must not read as "this model takes no images".
const pngOf = (side: number): string => {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(side * 3, Buffer.from([255, 0, 0]))]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: side }, () => row)));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
};
const image = await post({ messages: [{ role: 'user', content: [{ type: 'text', text: 'What colour is this image? One word.' }, { type: 'image_url', image_url: { url: pngOf(64) } }] }], max_completion_tokens: 512 });
const multimodal = image.status === 200;
note(`image input → ${multimodal ? 'accepted' : `refused (${image.status}: ${errorOf(image)})`}`);

// ─── the row ─────────────────────────────────────────────────

// The LOCAL date — the day the person running the probe would name.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
console.log(`\n// ${evidence.length} measurements above — paste as-is.`);
console.log(`  '${modelKey(providerId, model)}': {`);
const failedTrials = nested.filter((trial) => trial === 'failed').length;
const nestedNote = nestedInconclusive ? ' // INCONCLUSIVE: no tool call came back; assumed to mangle' : ` // nested: ${failedTrials} of ${nested.length} trials failed`;
console.log(`    capabilities: { nativeJsonSchema: ${nativeJsonSchema}, toolsWithStructuredOutput: ${toolsWithStructuredOutput}, manglesNestedToolArgs: ${mangles}, multimodal: ${multimodal} },${nestedNote}`);
console.log(`    reasoningEfforts: [${efforts.map((effort) => `'${effort}'`).join(', ')}],`);
console.log(`    verified: '${today}',`);
console.log('  },');
