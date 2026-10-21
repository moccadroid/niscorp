import { z } from 'zod';
import { LayoutNodeSchema } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import type { Canvas, Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { Catalog } from './catalog';
import type { Picks } from './pick';
import type { Said, Written } from './plan';
import type { OpenCanvas } from './screen';

export type Fill = <T>(system: string, user: string, schema: z.ZodType<T>) => Promise<T>;

// The bounds keep what the model writes to a title and two short sentences: a longer one is sent back to it.
const Reply = z.object({
  canvases: z
    .array(z.object({ action: z.string(), input: z.record(z.string(), z.unknown()), intent: z.string().describe('Why the canvas is there, in a few words.') }))
    .max(AREAS.length)
    .optional(),
  arrangement: z.string().optional(),
  layout: z.unknown().optional(),
  say: z.object({ title: z.string().max(60), text: z.string().max(240) }).optional(),
  screen: z.string().optional(),
});

type Reply = z.infer<typeof Reply>;

// What the model answered, once it holds: one of the app's screens as it is, or canvases with words above them, laid
// out as it said.
export type Answer = { screen?: string; canvases: Canvas[]; said?: Said; arrangement?: string | Written };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: unknown, keys: readonly string[]): boolean => isRecord(value) && Object.keys(value).every((key) => keys.includes(key));

// A layout the model writes is a grid and nothing else: `Answers` with its columns, and an `Area` for each canvas — the
// first areas, in order, each holding its own CanvasSlot, each as wide as the columns allow. Anything else is ignored,
// and the arrangement asked for by name, or the one that fits, stands.
const writtenOf = (layout: unknown): Written | undefined => {
  if (!LayoutNodeSchema.safeParse(layout).success || !isRecord(layout) || layout['component'] !== 'Answers' || !onlyKeys(layout, ['component', 'props', 'children'])) return undefined;
  const props = layout['props'];
  const columns = isRecord(props) ? props['columns'] : undefined;
  if (!onlyKeys(props, ['columns']) || typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > 3) return undefined;
  const areas = Array.isArray(layout['children']) ? layout['children'] : [];
  const fits = areas.every((area: unknown, at) => {
    if (!isRecord(area) || area['component'] !== 'Area' || !onlyKeys(area, ['component', 'props', 'children'])) return false;
    const { name, span = 1 } = isRecord(area['props']) ? area['props'] : {};
    const slots = Array.isArray(area['children']) ? area['children'] : [];
    const slot: unknown = slots[0];
    return (
      onlyKeys(area['props'], ['name', 'span']) &&
      name === AREAS[at] &&
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
  return fits && areas.length > 0 && areas.length <= AREAS.length ? { layout: layout as Written['layout'], slots: areas.length } : undefined;
};

const json = (value: unknown): string => JSON.stringify(value);

const schemaOf = (schema: unknown): unknown => (isRecord(schema) ? Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema')) : schema);

// What never changes between messages comes first, so the provider's prompt cache holds it.
export const systemOf = (catalog: Catalog, screens: readonly Screen[], arrangements: readonly Arrangement[]): string => `You answer a person's message with a screen. A screen is up to ${AREAS.length} canvases, each an action opened with an input, laid out in an arrangement. The screen is the answer: prefer actions to words, always.

There is no chat history: the screen open when the message arrives is the conversation, and the message is about it. Keep every canvas that is still wanted, with its input as it is, or changed where the message changes it. A canvas you leave out goes.

ACTIONS — what you may place (id — what it shows; its input, as JSON Schema):
${catalog.actions.map((action) => `- ${action.id} — ${action.description}\n  input: ${json(schemaOf(action.schema))}`).join('\n')}

READS — what an action shows, by fingerprint (fingerprint — what it answers; the rows it answers; the values it is asked with, in "params"):
${catalog.reads.map((read) => `- ${read.fingerprint} — ${read.intent}; rows: ${json(read.shape)}; params: ${read.context.length > 0 ? read.context.join(', ') : 'none'}`).join('\n')}

WRITES — what a form saves through (fingerprint — what it does; the keys of its fields):
${catalog.writes.map((write) => `- ${write.fingerprint} — ${write.intent}; fields: ${write.context.join(', ')}`).join('\n')}

SCREENS — the app's own screens, shown as they are with "screen":
${screens.map((screen) => `- ${screen.id} — ${screen.label}: ${screen.canvases.map((canvas) => canvas.intent).join('; ')}`).join('\n')}

ARRANGEMENTS (id — what it suits; how many canvases it holds):
${arrangements.map((arrangement) => `- ${arrangement.id} — ${arrangement.suits}; ${arrangement.slots}`).join('\n')}

Reply with { "canvases": [{ "action": "…", "input": { … }, "intent": "…" }], "arrangement": "…" }, adding "say" or "screen" only as below.
- canvases: the most important first. Canvases that stay keep the order they have on screen, unless the message asks to move them. An input follows its action's schema; a read's params carry every value it is asked with. intent: why the canvas is there, in a few words.
- A form is filled in from the message, where the message says what goes in a field; the person saves it, never you. When a form on screen is what the message is about, answer with that form, its fields filled in, and keep the rest of the screen.
- arrangement: one that holds every canvas, words counting as one. Only when none suits, write "layout" instead: { "component": "Answers", "props": { "columns": 1 to 3 }, "children": [{ "component": "Area", "props": { "name": "a", "span": 1 }, "children": [{ "component": "CanvasSlot", "props": { "canvasId": "a" } }] }, …] } — one Area for each canvas, named ${AREAS.join(', ')} in order, its span the columns it takes.
- say: { "title": "a few words", "text": "at most two short sentences" } — only when the message asks about this app itself, or asks for something no action shows. Never what the screen already shows.
- screen: the id of one of the app's screens — only when the message asks for that screen as it is; then no canvases.`;

const pickedOf = (picks: Picks): string => {
  const yes = <T extends { p: number }>(list: readonly T[], name: (item: T) => string): string =>
    list
      .filter((item) => item.p >= 0.5)
      .map((item) => `${name(item)} (${item.p.toFixed(2)})`)
      .join(', ') || 'none';
  return [
    `actions: ${yes(picks.actions, (item) => item.id)}`,
    `reads: ${yes(picks.reads, (item) => item.fingerprint)}`,
    `writes: ${yes(picks.writes, (item) => item.fingerprint)}`,
    `screens: ${yes(picks.screens, (item) => item.id)}`,
    `arrangement: ${picks.arrangement ?? 'none'}`,
  ].join('\n');
};

// Without a Jev pass, or with one that did not answer, the model is told nothing of it.
export const userOf = (message: string, open: readonly OpenCanvas[], arrangement: string, picks: Picks | undefined): string =>
  [
    `OPEN SCREEN (arrangement ${arrangement}):`,
    open.length === 0 ? 'nothing' : open.map((canvas) => `- ${canvas.area}: ${canvas.action} — ${canvas.intent}\n  input: ${json(canvas.input)}\n  holds: ${json(canvas.holds)}`).join('\n'),
    '',
    ...(picks === undefined ? [] : ['A FAST PICKER THINKS (a hint; the probability that each belongs in the answer):', pickedOf(picks), '']),
    `MESSAGE: ${message}`,
  ].join('\n');

// What makes an answer unusable, each said so the model can fix it: an action or a screen that does not exist, an input
// its action does not take, a read or a write the app does not ship, a value a read or write is asked with left out.
const refusalsOf = (reply: Reply, catalog: Catalog, screens: readonly Screen[]): string[] => {
  if (reply.screen !== undefined) return screens.some((screen) => screen.id === reply.screen) ? [] : [`"${reply.screen}" is not one of the app's screens.`];
  return (reply.canvases ?? []).flatMap((canvas, at) => {
    const where = `canvases[${at}] (${canvas.action})`;
    const action = catalog.actions.find((candidate) => candidate.id === canvas.action);
    if (action === undefined) return [`${where}: there is no action "${canvas.action}".`];
    const parsed = action.input.safeParse(canvas.input);
    if (!parsed.success) return parsed.error.issues.map((issue) => `${where}: input.${issue.path.join('.')}: ${issue.message}`);
    const refusals: string[] = [];
    const read = canvas.input['read'];
    if (typeof read === 'string') {
      const known = catalog.reads.find((candidate) => candidate.fingerprint === read);
      const params = isRecord(canvas.input['params']) ? canvas.input['params'] : {};
      if (known === undefined) refusals.push(`${where}: there is no read "${read}".`);
      else for (const key of known.context) if (params[key] === undefined || params[key] === '') refusals.push(`${where}: the read "${read}" is asked with params.${key}, and it is missing.`);
    }
    const write = canvas.input['write'];
    if (typeof write === 'string') {
      const known = catalog.writes.find((candidate) => candidate.fingerprint === write);
      const keys = (Array.isArray(canvas.input['fields']) ? canvas.input['fields'] : []).map((field: unknown) => (isRecord(field) ? field['key'] : undefined));
      if (known === undefined) refusals.push(`${where}: there is no write "${write}".`);
      else for (const key of known.context) if (!keys.includes(key)) refusals.push(`${where}: the write "${write}" saves a field "${key}", and the form has none.`);
    }
    return refusals;
  });
};

const answerOf = (reply: Reply, arrangements: readonly Arrangement[]): Answer => {
  const canvases: Canvas[] = [];
  for (const canvas of reply.canvases ?? []) if (!canvases.some((there) => there.action === canvas.action && json(there.input) === json(canvas.input))) canvases.push({ action: canvas.action, input: canvas.input, intent: canvas.intent.trim() });
  const written = reply.layout === undefined ? undefined : writtenOf(reply.layout);
  const named = arrangements.some((arrangement) => arrangement.id === reply.arrangement) ? reply.arrangement : undefined;
  const arrangement = written ?? named;
  return {
    ...(reply.screen !== undefined ? { screen: reply.screen } : {}),
    canvases: reply.screen !== undefined ? [] : canvases,
    ...(reply.say !== undefined && reply.say.text.trim() !== '' ? { said: { title: reply.say.title.trim(), text: reply.say.text.trim() } } : {}),
    ...(arrangement !== undefined ? { arrangement } : {}),
  };
};

// One call; an answer that does not hold is sent back once with what is wrong with it. `calls` says how many it took.
export const fill = async (
  system: string,
  user: string,
  catalog: Catalog,
  screens: readonly Screen[],
  arrangements: readonly Arrangement[],
  fillWith: Fill,
): Promise<{ answer: Answer; calls: number } | { refused: string[]; calls: number }> => {
  const first = await fillWith(system, user, Reply);
  const refused = refusalsOf(first, catalog, screens);
  if (refused.length === 0) return { answer: answerOf(first, arrangements), calls: 1 };
  const again = await fillWith(system, `${user}\n\nYOUR LAST ANSWER WAS REFUSED:\n${refused.map((reason) => `- ${reason}`).join('\n')}\nAnswer again.`, Reply);
  const still = refusalsOf(again, catalog, screens);
  return still.length === 0 ? { answer: answerOf(again, arrangements), calls: 2 } : { refused: still, calls: 2 };
};
