import { z } from 'zod';
import { LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { fieldsOf, rowsOf } from './catalog';
import type { Catalog } from './catalog';
import type { Picks } from './pick';
import { areasIn, areasOfArrangement, whereOf } from './plan';
import type { Placed, Said, Written } from './plan';
import type { OpenCanvas } from './screen';

export type Fill = <T>(system: string, user: string, schema: z.ZodType<T>) => Promise<T>;

// One entry for each area the answer changes: a canvas moved there (`keep`, the area it is in now), a canvas, words, or
// nothing (`drop`). The bounds keep
// words to a title and two short sentences: a longer one is sent back to the model.
const Entry = z.object({
  area: z.enum(AREAS),
  keep: z.enum(AREAS).optional(),
  action: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  intent: z.string().optional(),
  say: z.object({ title: z.string().max(60), text: z.string().max(240) }).optional(),
  drop: z.boolean().optional(),
});

// `reasoning` comes first, so the model says what it will do before it writes the areas.
const Reply = z.object({
  reasoning: z.string().max(120),
  areas: z.array(Entry).max(AREAS.length).optional(),
  arrangement: z.string().optional(),
  layout: z.unknown().optional(),
  screen: z.string().optional(),
});

type Reply = z.infer<typeof Reply>;
type Entry = z.infer<typeof Entry>;

// What the model answered, once it holds: one of the app's screens as it is, or what each area holds, laid out as it
// said; no arrangement keeps the one on screen.
export type Answer = { reasoning: string; screen?: string; placed: Placed; said: Partial<Record<AreaId, Said>>; arrangement?: string | Written };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: unknown, keys: readonly string[]): boolean => isRecord(value) && Object.keys(value).every((key) => keys.includes(key));

// A layout the model writes is a grid and nothing else: `Answers` with its columns, and an `Area` for each area, each
// holding its own CanvasSlot, each as wide as the columns allow. Anything else is ignored.
const writtenOf = (layout: unknown): Written | undefined => {
  if (!LayoutNodeSchema.safeParse(layout).success || !isRecord(layout) || layout['component'] !== 'Answers' || !onlyKeys(layout, ['component', 'props', 'children'])) return undefined;
  const props = layout['props'];
  const columns = isRecord(props) ? props['columns'] : undefined;
  if (!onlyKeys(props, ['columns']) || typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > 3) return undefined;
  const areas = Array.isArray(layout['children']) ? layout['children'] : [];
  const fits = areas.every((area: unknown) => {
    if (!isRecord(area) || area['component'] !== 'Area' || !onlyKeys(area, ['component', 'props', 'children'])) return false;
    const { name, span = 1 } = isRecord(area['props']) ? area['props'] : {};
    const slots = Array.isArray(area['children']) ? area['children'] : [];
    const slot: unknown = slots[0];
    return (
      onlyKeys(area['props'], ['name', 'span']) &&
      (AREAS as readonly unknown[]).includes(name) &&
      typeof span === 'number' &&
      Number.isInteger(span) &&
      span >= 1 &&
      span <= columns &&
      slots.length === 1 &&
      isRecord(slot) &&
      slot['component'] === 'CanvasSlot' &&
      onlyKeys(slot, ['component', 'props']) &&
      onlyKeys(slot['props'], ['canvasId']) &&
      isRecord(slot['props']) &&
      slot['props']['canvasId'] === name
    );
  });
  const named = areasIn(layout);
  return fits && named.length > 0 && new Set(named).size === named.length ? { layout: layout as LayoutNode, areas: named } : undefined;
};

const json = (value: unknown): string => JSON.stringify(value);

// What never changes between messages comes first, so the provider's prompt cache holds it.
export const systemOf = (catalog: Catalog, screens: readonly Screen[], arrangements: readonly Arrangement[]): string => `You answer a person's message with a screen: up to ${AREAS.length} canvases, each an action opened with an input, on the areas ${AREAS.join(', ')} of an arrangement. The screen is the answer: prefer actions to words, always.

There is no chat history: the screen open when the message arrives is the conversation, and the message is about it. Change only what the message asks to change; keep everything else exactly where it is.

ACTIONS — what you may place (id — what a person sees; its input):
${catalog.actions.map((action) => `- ${action.id} — ${action.description}\n  input: ${fieldsOf(action.schema)}`).join('\n')}

READS — what an action shows (fingerprint — what it answers → its rows; params: the values it is asked with):
${catalog.reads.map((read) => `- ${read.fingerprint} — ${read.intent} → ${rowsOf(read.shape)}; params: ${read.context.length > 0 ? read.context.join(', ') : 'none'}`).join('\n')}

WRITES — what a form saves through (fingerprint — what it does; the keys of its fields):
${catalog.writes.map((write) => `- ${write.fingerprint} — ${write.intent}; fields: ${write.context.join(', ')}`).join('\n')}

SCREENS — the app's own screens, shown as they are with "screen":
${screens.map((screen) => `- ${screen.id} — ${screen.label}: ${screen.canvases.map((canvas) => canvas.intent).join('; ')}`).join('\n')}

ARRANGEMENTS (id — what it suits — its areas, row by row):
${arrangements.map((arrangement) => `- ${arrangement.id} — ${arrangement.suits} — ${whereOf(arrangement.layout)}`).join('\n')}

Reply with { "reasoning": "…", "areas": [ … ] }, adding "arrangement" or "screen" only as below.
- reasoning: first, one plain sentence for the person, at most 120 characters: what you change and why, or why nothing changes. Name what they see, never area letters, arrangement names or fingerprints.
- areas: an entry for each area that changes. An area you leave out stays as it is, unless the arrangement has no such area.
  { "area": "a", "keep": "c" } moves the canvas of area c to area a; area c is then empty, unless you give it something.
  { "area": "e", "drop": true } empties area e.
  { "area": "e", "action": "…", "input": { … }, "intent": "why it is there, in a few words" } puts a canvas there. To change a canvas, give it again with its input changed. An input has its action's fields; a read's params carry every value it is asked with.
  { "area": "a", "say": { "title": "a few words", "text": "at most two short sentences" } } puts words there — only when the message asks about this app itself, or for something no action shows.
- A form is filled in from the message, where the message says what goes in a field; the person saves it, never you. A message that gives values for the fields of a form on screen is about that form: fill it in, in its area, and keep the rest.
- arrangement: leave it out to keep the one on screen. Give another only when the answer needs other room; every area you use must be in it. When none suits, or the message says where things go and none puts them there, write "layout" instead: { "component": "Answers", "props": { "columns": 1 to 3 }, "children": [{ "component": "Area", "props": { "name": "a", "span": 1 }, "children": [{ "component": "CanvasSlot", "props": { "canvasId": "a" } }] }, …] } — an Area for each area you use, its span the columns it takes.
- screen: the id of one of the app's screens, only when the message asks for that screen as it is; then no areas.`;

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
  return `actions ${yes(picks.actions, (item) => item.id)}; reads ${yes(picks.reads, (item) => item.fingerprint)}; writes ${yes(picks.writes, (item) => item.fingerprint)}; screens ${yes(picks.screens, (item) => item.id)}; arrangement ${picks.arrangement ?? 'none'}`;
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
  const written = reply.layout === undefined ? undefined : writtenOf(reply.layout);
  return written ?? (arrangements.some((arrangement) => arrangement.id === reply.arrangement) ? reply.arrangement : undefined);
};

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

// What makes an answer unusable, each said so the model can fix it: a screen, action, read or write that does not exist,
// an input its action does not take, a value a read or write is asked with left out or one it does not take, an area
// given twice or not in the
// arrangement, a keep of an empty area, an entry that is not exactly one of keep, a canvas or words, the same thing in
// two areas.
const refusalsOf = (reply: Reply, open: Placed, current: string | Written, catalog: Catalog, screens: readonly Screen[], arrangements: readonly Arrangement[]): string[] => {
  if (reply.screen !== undefined) return screens.some((screen) => screen.id === reply.screen) ? [] : [`"${reply.screen}" is not one of the app's screens.`];
  const refusals: string[] = [];
  if (reply.arrangement !== undefined && reply.layout === undefined && !arrangements.some((arrangement) => arrangement.id === reply.arrangement)) refusals.push(`there is no arrangement "${reply.arrangement}".`);
  const arrangement = arrangementOf(reply, arrangements) ?? current;
  const room = areasOfArrangement(arrangement, arrangements);
  const named = typeof arrangement === 'object' ? 'you wrote' : `"${arrangement}"`;
  const seen = new Set<AreaId>();
  (reply.areas ?? []).forEach((entry, at) => {
    const where = `areas[${at}] (area ${entry.area})`;
    if (seen.has(entry.area)) refusals.push(`${where}: area ${entry.area} is given twice.`);
    seen.add(entry.area);
    if (!room.includes(entry.area)) refusals.push(`${where}: the arrangement ${named} has no area ${entry.area}; its areas are ${room.join(', ')}.`);
    const kinds = [entry.keep !== undefined, entry.action !== undefined || entry.input !== undefined, entry.say !== undefined, entry.drop === true].filter(Boolean).length;
    if (kinds !== 1) refusals.push(`${where}: give exactly one of "keep", "action" with "input", "say", or "drop".`);
    else if (entry.keep !== undefined) {
      if (open[entry.keep] === undefined) refusals.push(`${where}: there is nothing in area ${entry.keep} to keep.`);
    } else if (entry.action !== undefined || entry.input !== undefined) refusals.push(...canvasRefusals(entry, where, catalog));
  });
  const shown = new Map<string, AreaId>();
  const { placed } = resultOf(reply, open, room, catalog);
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

// What each area holds once the answer is applied: what was there stays, in the areas the arrangement has, unless an
// entry drops it, moves it (an area another entry keeps from is empty unless it is given something), or puts another
// canvas or words there.
const resultOf = (reply: Reply, open: Placed, room: readonly AreaId[], catalog: Catalog): { placed: Placed; said: Partial<Record<AreaId, Said>> } => {
  const entries = reply.areas ?? [];
  const placed: Placed = Object.fromEntries(room.flatMap((area) => (open[area] !== undefined ? [[area, open[area]]] : [])));
  const said: Partial<Record<AreaId, Said>> = {};
  for (const entry of entries) if (entry.keep !== undefined && entry.keep !== entry.area && !entries.some((other) => other.area === entry.keep)) delete placed[entry.keep];
  for (const entry of entries) {
    delete placed[entry.area];
    if (entry.keep !== undefined) {
      const kept = open[entry.keep];
      if (kept !== undefined) placed[entry.area] = kept;
    } else if (entry.say !== undefined) said[entry.area] = { title: entry.say.title.trim(), text: entry.say.text.trim() };
    else if (entry.action !== undefined) {
      const intent = entry.intent?.trim() ?? '';
      placed[entry.area] = { action: entry.action, input: entry.input ?? {}, intent: intent !== '' ? intent : (catalog.actions.find((action) => action.id === entry.action)?.description ?? '') };
    }
  }
  return { placed, said };
};

const answerOf = (reply: Reply, open: Placed, current: string | Written, catalog: Catalog, arrangements: readonly Arrangement[]): Answer => {
  const reasoning = reply.reasoning.trim();
  if (reply.screen !== undefined) return { reasoning, screen: reply.screen, placed: {}, said: {} };
  const arrangement = arrangementOf(reply, arrangements);
  const { placed, said } = resultOf(reply, open, areasOfArrangement(arrangement ?? current, arrangements), catalog);
  return { reasoning, placed, said, ...(arrangement !== undefined ? { arrangement } : {}) };
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
  const first = await fillWith(system, user, Reply);
  const refused = refusalsOf(first, open, current, catalog, screens, arrangements);
  if (refused.length === 0) return { answer: answerOf(first, open, current, catalog, arrangements), calls: 1 };
  const again = await fillWith(system, `${user}\n\nYOUR LAST ANSWER WAS REFUSED:\n${refused.map((reason) => `- ${reason}`).join('\n')}\nAnswer again.`, Reply);
  const still = refusalsOf(again, open, current, catalog, screens, arrangements);
  return still.length === 0 ? { answer: answerOf(again, open, current, catalog, arrangements), calls: 2 } : { refused: still, calls: 2 };
};
