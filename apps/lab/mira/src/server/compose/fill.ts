import { z } from 'zod';
import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import type { Catalog } from './catalog';
import type { Picks } from './pick';
import { areasOfArrangement, whereOf } from './plan';
import type { Placed, Said, Written } from './plan';
import type { OpenCanvas } from './screen';

export type Fill = <T>(system: string, user: string, schema: z.ZodType<T>) => Promise<T>;

const AreaName = z.enum(AREAS);

const GridSchema = z
  .object({
    columns: z.number().int().min(1).max(3).describe('How many columns the areas are laid out in.'),
    areas: z
      .array(
        z
          .object({
            name: AreaName.describe('An area the answer uses.'),
            span: z.number().int().min(1).max(3).nullish().describe('How many of the columns it takes; one when left out.'),
          })
          .strict(),
      )
      .min(1)
      .max(AREAS.length)
      .describe('The areas the answer uses, in the order they are drawn, row by row.'),
  })
  .strict()
  .describe('A layout of your own, only when no arrangement suits, or the message says where things go and no arrangement puts them there.');

const EntrySchema = z
  .object({
    area: AreaName.describe('The area this entry is for.'),
    keep: AreaName.nullish().describe('Moves the canvas now in that area here, unchanged. That area is then empty, unless another entry gives it something.'),
    action: z.string().nullish().describe('Puts a canvas here: the id of one of the ACTIONS.'),
    input: z
      .record(z.string(), z.unknown())
      .nullish()
      .describe("What the canvas is opened with, as its action's input schema says. A read's params carry every value it is asked with; a form's fields carry what the message gives for them."),
    intent: z.string().nullish().describe('Why the canvas is there, in a few words.'),
    say: z
      .object({ title: z.string().max(60).describe('A few words.'), text: z.string().max(240).describe('At most two short sentences.') })
      .strict()
      .nullish()
      .describe('Puts words here: only when the message asks about this app itself, or for something no action shows.'),
    drop: z.boolean().nullish().describe('Empties this area.'),
  })
  .strict()
  .describe('What one area holds after the answer: exactly one of keep, action with input and intent, say, or drop.');

// `reasoning` and `title` come first, so the model says what it will do before it writes the areas.
const ReplySchema = z
  .object({
    reasoning: z
      .string()
      .max(120)
      .describe('One plain sentence for the person, at most 120 characters: what you change and why, or why nothing changes. Name what they see, never area letters, arrangement names or fingerprints.'),
    title: z.string().max(40).describe('What the answer is, in at most four words ("German greetings", "A joke"), never the message repeated. It names the answer among the others.'),
    areas: z.array(EntrySchema).max(AREAS.length).nullish().describe('An entry for each area that changes. An area left out stays as it is, unless the arrangement has no such area.'),
    arrangement: z.string().nullish().describe('The id of one of the ARRANGEMENTS, only when the answer needs other room than the one on screen; every area used must be in it.'),
    grid: GridSchema.nullish(),
    screen: z.string().nullish().describe('The id of one of the SCREENS, only when the message asks for that screen as it is; then no areas.'),
  })
  .strict();

type Reply = z.infer<typeof ReplySchema>;
type Grid = z.infer<typeof GridSchema>;

// An entry as the model gave it, with what it left out as undefined.
type Entry = { area: AreaId; keep?: AreaId; action?: string; input?: Record<string, unknown>; intent?: string; say?: Said; drop: boolean };

const entriesOf = (reply: Reply): Entry[] =>
  (reply.areas ?? []).map(({ area, keep, action, input, intent, say, drop }) => ({
    area,
    ...(keep ? { keep } : {}),
    ...(action ? { action } : {}),
    ...(input ? { input } : {}),
    ...(intent ? { intent } : {}),
    ...(say ? { say: { title: say.title.trim(), text: say.text.trim() } } : {}),
    drop: drop === true,
  }));

// What the model answered, once it holds: one of the app's screens as it is, or what each area holds, laid out as it
// said; no arrangement keeps the one on screen.
export type Answer = { reasoning: string; title: string; screen?: string; placed: Placed; said: Partial<Record<AreaId, Said>>; arrangement?: string | Written };

const json = (value: unknown): string => JSON.stringify(value);

const schemaOf = (schema: unknown): unknown =>
  schema !== null && typeof schema === 'object' && !Array.isArray(schema) ? Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema')) : schema;

const gridLayout = (grid: Grid): Written => ({
  layout: {
    component: 'Answers',
    props: { columns: grid.columns },
    children: grid.areas.map(({ name, span }) => ({ component: 'Area', props: { name, span: span ?? 1 }, children: [{ component: 'CanvasSlot', props: { canvasId: name } }] })),
  },
  areas: grid.areas.map(({ name }) => name),
});

// What never changes between messages comes first, so the provider's prompt cache holds it.
export const systemOf = (catalog: Catalog, screens: readonly Screen[], arrangements: readonly Arrangement[]): string => `You answer a person's message with a screen: up to ${AREAS.length} canvases, each an action opened with an input, on the areas ${AREAS.join(', ')} of an arrangement. The screen is the answer: prefer actions to words, always. There is no chat history: the screen open when the message arrives is the conversation, and the message is about it. Change only what the message asks to change; keep everything else exactly where it is. A message that gives values for the fields of a form on screen is about that form, even when it only states them: fill it in, in its area, and keep the rest. The person saves a form, never you.

ACTIONS — what a person sees, and the input schema
${catalog.actions.map((action) => `- ${action.id}: ${action.description} Input: ${json(schemaOf(action.schema))}`).join('\n')}

READS — what it answers, its rows, and the params it is asked with
${catalog.reads.map((read) => `- ${read.fingerprint}: ${read.intent}. Rows: ${json(read.shape)}. Params: ${json(read.context)}`).join('\n')}

WRITES — what it does, and the keys of the fields a form saves through it
${catalog.writes.map((write) => `- ${write.fingerprint}: ${write.intent}. Fields: ${json(write.context)}`).join('\n')}

SCREENS
${screens.map((screen) => `- ${screen.id}: ${screen.description}`).join('\n')}

ARRANGEMENTS — and their areas, row by row
${arrangements.map((arrangement) => `- ${arrangement.id}: ${arrangement.description} Areas: ${whereOf(arrangement.layout)}`).join('\n')}

REPLY — its JSON Schema
${json(schemaOf(z.toJSONSchema(ReplySchema)))}`;

const canvasLine = (canvas: OpenCanvas): string => {
  const what = canvas.action === 'answer.text' ? `words ${json({ title: canvas.input['title'], text: canvas.input['text'] })}` : `input ${json(canvas.input)}`;
  const shows = Object.keys(canvas.shows).length > 0 ? ` — shows ${json(canvas.shows)}` : '';
  return `- ${canvas.area}: ${canvas.action} — ${canvas.intent} — ${what}${shows}`;
};

const pickedOf = (picks: Picks): string => {
  const yes = <T extends { p: number }>(list: readonly T[], name: (item: T) => string): string =>
    list
      .filter((item) => item.p >= 0.5)
      .map((item) => `${name(item)} ${item.p.toFixed(2)}`)
      .join(', ') || 'none';
  return `actions ${yes(picks.actions, (item) => item.id)}; reads ${yes(picks.reads, (item) => item.fingerprint)}; writes ${yes(picks.writes, (item) => item.fingerprint)}; screens ${yes(picks.screens, (item) => item.id)}`;
};

// Without a Jev pass, or with one that did not answer, the model is told nothing of it.
export const userOf = (message: string, open: readonly OpenCanvas[], arrangement: { id: string; layout: LayoutNode }, picks: Picks | undefined): string =>
  [
    `OPEN SCREEN — arrangement ${arrangement.id}: ${whereOf(arrangement.layout)}`,
    ...(open.length === 0 ? ['nothing'] : open.map(canvasLine)),
    ...(picks === undefined ? [] : ['', `A FAST PICKER THINKS (a hint; how likely each belongs in the answer): ${pickedOf(picks)}`]),
    '',
    `MESSAGE: ${message}`,
  ].join('\n');

const arrangementOf = (reply: Reply, arrangements: readonly Arrangement[]): string | Written | undefined => {
  if (reply.grid) return gridLayout(reply.grid);
  return arrangements.find((arrangement) => arrangement.id === reply.arrangement)?.id;
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const canvasRefusals = (entry: Entry, where: string, catalog: Catalog): string[] => {
  const action = catalog.actions.find((candidate) => candidate.id === entry.action);
  if (action === undefined) return [`${where}: there is no action "${String(entry.action)}".`];
  const input = entry.input ?? {};
  const parsed = action.input.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${where}: input.${issue.path.join('.')}: ${issue.message}`);
  const refusals: string[] = [];
  const read = input['read'];
  if (typeof read === 'string') {
    const known = catalog.reads.find((candidate) => candidate.fingerprint === read);
    const params = isRecord(input['params']) ? input['params'] : {};
    if (known === undefined) refusals.push(`${where}: there is no read "${read}".`);
    else {
      for (const key of known.context) if (params[key] === undefined || params[key] === '') refusals.push(`${where}: the read "${read}" is asked with params.${key}, and it is missing.`);
      for (const key of Object.keys(params)) if (!known.context.includes(key)) refusals.push(`${where}: the read "${read}" takes no params.${key}; it takes ${known.context.length > 0 ? known.context.join(', ') : 'none'}.`);
    }
  }
  const write = input['write'];
  if (typeof write === 'string') {
    const known = catalog.writes.find((candidate) => candidate.fingerprint === write);
    const keys = (Array.isArray(input['fields']) ? input['fields'] : []).map((field: unknown) => (isRecord(field) ? field['key'] : undefined));
    if (known === undefined) refusals.push(`${where}: there is no write "${write}".`);
    else for (const key of known.context) if (!keys.includes(key)) refusals.push(`${where}: the write "${write}" saves a field "${key}", and the form has none.`);
  }
  return refusals;
};

// What each area holds once the answer is applied: what was there stays, in the areas the arrangement has, unless an
// entry drops it, moves it (an area another entry keeps from is empty unless it is given something), or puts another
// canvas or words there.
const resultOf = (entries: readonly Entry[], open: Placed, room: readonly AreaId[], catalog: Catalog): { placed: Placed; said: Partial<Record<AreaId, Said>> } => {
  const placed: Placed = Object.fromEntries(room.flatMap((area) => (open[area] !== undefined ? [[area, open[area]]] : [])));
  const said: Partial<Record<AreaId, Said>> = {};
  for (const entry of entries) if (entry.keep !== undefined && entry.keep !== entry.area && !entries.some((other) => other.area === entry.keep)) delete placed[entry.keep];
  for (const entry of entries) {
    delete placed[entry.area];
    if (entry.keep !== undefined) {
      const kept = open[entry.keep];
      if (kept !== undefined) placed[entry.area] = kept;
    } else if (entry.say !== undefined) said[entry.area] = entry.say;
    else if (entry.action !== undefined) {
      const intent = entry.intent?.trim() ?? '';
      placed[entry.area] = { action: entry.action, input: entry.input ?? {}, intent: intent !== '' ? intent : (catalog.actions.find((action) => action.id === entry.action)?.description ?? '') };
    }
  }
  return { placed, said };
};

// What makes an answer unusable, each said so the model can fix it: a screen, action, read or write that does not exist,
// an input its action does not take, a value a read or write is asked with left out or one it does not take, an area
// given twice or not in the arrangement, a keep of an empty area, an entry that is not exactly one of keep, a canvas,
// words or drop, the same thing in two areas.
const refusalsOf = (reply: Reply, open: Placed, current: string | Written, catalog: Catalog, screens: readonly Screen[], arrangements: readonly Arrangement[]): string[] => {
  if (reply.screen) return screens.some((screen) => screen.id === reply.screen) ? [] : [`"${reply.screen}" is not one of the app's screens.`];
  const refusals: string[] = [];
  if (reply.arrangement && !reply.grid && !arrangements.some((arrangement) => arrangement.id === reply.arrangement)) refusals.push(`there is no arrangement "${reply.arrangement}".`);
  if (reply.grid && new Set(reply.grid.areas.map(({ name }) => name)).size !== reply.grid.areas.length) refusals.push('the grid names an area twice.');
  const arrangement = arrangementOf(reply, arrangements) ?? current;
  const room = areasOfArrangement(arrangement, arrangements);
  const named = typeof arrangement === 'object' ? 'you wrote' : `"${arrangement}"`;
  const entries = entriesOf(reply);
  const seen = new Set<AreaId>();
  entries.forEach((entry, at) => {
    const where = `areas[${at}] (area ${entry.area})`;
    if (seen.has(entry.area)) refusals.push(`${where}: area ${entry.area} is given twice.`);
    seen.add(entry.area);
    if (!room.includes(entry.area)) refusals.push(`${where}: the arrangement ${named} has no area ${entry.area}; its areas are ${room.join(', ')}.`);
    const kinds = [entry.keep !== undefined, entry.action !== undefined || entry.input !== undefined, entry.say !== undefined, entry.drop].filter(Boolean).length;
    if (kinds !== 1) refusals.push(`${where}: give exactly one of "keep", "action" with "input", "say", or "drop".`);
    else if (entry.keep !== undefined) {
      if (open[entry.keep] === undefined) refusals.push(`${where}: there is nothing in area ${entry.keep} to keep.`);
    } else if (entry.action !== undefined || entry.input !== undefined) refusals.push(...canvasRefusals(entry, where, catalog));
  });
  const shown = new Map<string, AreaId>();
  const { placed } = resultOf(entries, open, room, catalog);
  for (const area of AREAS) {
    const canvas = placed[area];
    if (canvas === undefined) continue;
    // A read shown again with the same values is the same thing under another heading; so is a second form for one write.
    const { read, params, write } = canvas.input;
    const what = json(read !== undefined ? [canvas.action, read, params] : write !== undefined ? [canvas.action, write] : [canvas.action, canvas.input]);
    const there = shown.get(what);
    if (there !== undefined) refusals.push(`areas ${there} and ${area} would show the same thing; show it once.`);
    else shown.set(what, area);
  }
  return refusals;
};

const answerOf = (reply: Reply, open: Placed, current: string | Written, catalog: Catalog, arrangements: readonly Arrangement[]): Answer => {
  const reasoning = reply.reasoning.trim();
  const title = reply.title.trim();
  if (reply.screen) return { reasoning, title, screen: reply.screen, placed: {}, said: {} };
  const arrangement = arrangementOf(reply, arrangements);
  const { placed, said } = resultOf(entriesOf(reply), open, areasOfArrangement(arrangement ?? current, arrangements), catalog);
  return { reasoning, title, placed, said, ...(arrangement !== undefined ? { arrangement } : {}) };
};

// One call; an answer that does not hold is sent back once with what is wrong with it. `calls` says how many it took.
export const fill = async (
  system: string,
  user: string,
  open: Placed,
  current: string | Written,
  catalog: Catalog,
  screens: readonly Screen[],
  arrangements: readonly Arrangement[],
  fillWith: Fill,
): Promise<{ answer: Answer; calls: number } | { refused: string[]; calls: number }> => {
  const first = await fillWith(system, user, ReplySchema);
  const refused = refusalsOf(first, open, current, catalog, screens, arrangements);
  if (refused.length === 0) return { answer: answerOf(first, open, current, catalog, arrangements), calls: 1 };
  const again = await fillWith(system, `${user}\n\nYOUR LAST ANSWER WAS REFUSED:\n${refused.map((reason) => `- ${reason}`).join('\n')}\nAnswer again.`, ReplySchema);
  const still = refusalsOf(again, open, current, catalog, screens, arrangements);
  return still.length === 0 ? { answer: answerOf(again, open, current, catalog, arrangements), calls: 2 } : { refused: still, calls: 2 };
};
