import type { z } from 'zod';
import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import type { Usage } from '../runs';
import type { Catalog } from './catalog';
import { areasOfArrangement, gridLayout } from './layout';
import type { WrittenLayout } from './layout';
import type { AreaCanvases, Said } from './plan';
import { isRecord } from './record';
import { entriesOf, ReplySchema } from './reply.schema';
import type { Entry, Reply } from './reply.schema';

// A reply that does not fit the schema is `unfit`, with what is wrong with it.
export type Compose = <T>(system: string, user: string, schema: z.ZodType<T>) => Promise<{ reply: T; usage: Usage } | { unfit: string; usage: Usage }>;

// No arrangement keeps the one on screen.
export type Answer = { reasoning: string; title: string; screen?: string; canvases: AreaCanvases; said: Partial<Record<AreaId, Said>>; arrangement?: string | WrittenLayout };

export type AnswerContext = { open: AreaCanvases; current: string | WrittenLayout; catalog: Catalog; screens: readonly Screen[]; arrangements: readonly Arrangement[] };

const arrangementOfReply = (reply: Reply, arrangements: readonly Arrangement[]): string | WrittenLayout | undefined => {
  if (reply.grid) return gridLayout(reply.grid);
  return arrangements.find((arrangement) => arrangement.id === reply.arrangement)?.id;
};

const canvasRefusals = (entry: Entry, where: string, catalog: Catalog): string[] => {
  const action = catalog.actions.find((candidate) => candidate.id === entry.action);
  if (action === undefined) return [`${where}: there is no action "${String(entry.action)}".`];
  const input = entry.input ?? {};
  const parsed = action.check.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${where}: input.${issue.path.join('.')}: ${issue.message}`);
  const refusals: string[] = [];
  const read = input['read'];
  if (typeof read === 'string') {
    const known = catalog.reads.find((candidate) => candidate.fingerprint === read);
    const params = isRecord(input['params']) ? input['params'] : {};
    if (known === undefined) refusals.push(`${where}: there is no read "${read}".`);
    else {
      for (const key of known.contextKeys) if (params[key] === undefined || params[key] === '') refusals.push(`${where}: the read "${read}" is asked with params.${key}, and it is missing.`);
      for (const key of Object.keys(params)) if (!known.contextKeys.includes(key)) refusals.push(`${where}: the read "${read}" takes no params.${key}; it takes ${known.contextKeys.length > 0 ? known.contextKeys.join(', ') : 'none'}.`);
    }
  }
  const write = input['write'];
  if (typeof write === 'string') {
    const known = catalog.writes.find((candidate) => candidate.fingerprint === write);
    const keys = (Array.isArray(input['fields']) ? input['fields'] : []).map((field: unknown) => (isRecord(field) ? field['key'] : undefined));
    if (known === undefined) refusals.push(`${where}: there is no write "${write}".`);
    else for (const key of known.contextKeys) if (!keys.includes(key)) refusals.push(`${where}: the write "${write}" saves a field "${key}", and the form has none.`);
  }
  return refusals;
};

// What was there stays, in the areas the arrangement has, unless an entry drops it, moves it (an area another entry
// keeps from is empty unless it is given something), or puts another canvas or words there.
const applyEntries = (entries: readonly Entry[], open: AreaCanvases, room: readonly AreaId[], catalog: Catalog): { canvases: AreaCanvases; said: Partial<Record<AreaId, Said>> } => {
  const canvases: AreaCanvases = Object.fromEntries(room.flatMap((area) => (open[area] !== undefined ? [[area, open[area]]] : [])));
  const said: Partial<Record<AreaId, Said>> = {};
  for (const entry of entries) if (entry.keep !== undefined && entry.keep !== entry.area && !entries.some((other) => other.area === entry.keep)) delete canvases[entry.keep];
  for (const entry of entries) {
    delete canvases[entry.area];
    if (entry.keep !== undefined) {
      const kept = open[entry.keep];
      if (kept !== undefined) canvases[entry.area] = kept;
    } else if (entry.say !== undefined) said[entry.area] = entry.say;
    else if (entry.action !== undefined) {
      const intent = entry.intent?.trim() ?? '';
      canvases[entry.area] = { action: entry.action, input: entry.input ?? {}, intent: intent !== '' ? intent : (catalog.actions.find((action) => action.id === entry.action)?.description ?? '') };
    }
  }
  return { canvases, said };
};

// A read shown again with the same values is the same thing under another heading; so is a second form for one write.
const sameThingKey = (canvas: { action: string; input: Record<string, unknown> }): string => {
  const { read, params, write } = canvas.input;
  return JSON.stringify(read !== undefined ? [canvas.action, read, params] : write !== undefined ? [canvas.action, write] : [canvas.action, canvas.input]);
};

const refusalsOf = (reply: Reply, context: AnswerContext): string[] => {
  const { open, current, catalog, screens, arrangements } = context;
  if (reply.screen) return screens.some((screen) => screen.id === reply.screen) ? [] : [`"${reply.screen}" is not one of the app's screens.`];
  const refusals: string[] = [];
  if (reply.arrangement && !reply.grid && !arrangements.some((arrangement) => arrangement.id === reply.arrangement)) refusals.push(`there is no arrangement "${reply.arrangement}".`);
  if (reply.grid && new Set(reply.grid.areas.map(({ name }) => name)).size !== reply.grid.areas.length) refusals.push('the grid names an area twice.');
  const arrangement = arrangementOfReply(reply, arrangements) ?? current;
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
  const { canvases } = applyEntries(entries, open, room, catalog);
  for (const area of AREAS) {
    const canvas = canvases[area];
    if (canvas === undefined) continue;
    const there = shown.get(sameThingKey(canvas));
    if (there !== undefined) refusals.push(`areas ${there} and ${area} would show the same thing; show it once.`);
    else shown.set(sameThingKey(canvas), area);
  }
  return refusals;
};

const answerOf = (reply: Reply, context: AnswerContext): Answer => {
  const reasoning = reply.reasoning.trim();
  const title = reply.title.trim();
  if (reply.screen) return { reasoning, title, screen: reply.screen, canvases: {}, said: {} };
  const arrangement = arrangementOfReply(reply, context.arrangements);
  const { canvases, said } = applyEntries(entriesOf(reply), context.open, areasOfArrangement(arrangement ?? context.current, context.arrangements), context.catalog);
  return { reasoning, title, canvases, said, ...(arrangement !== undefined ? { arrangement } : {}) };
};

export const composeAnswer = async (prompts: { system: string; user: string }, context: AnswerContext, compose: Compose): Promise<({ answer: Answer } | { refused: string[] }) & { usage: Usage[] }> => {
  const first = await compose(prompts.system, prompts.user, ReplySchema);
  if ('unfit' in first) return { refused: [first.unfit], usage: [first.usage] };
  const refused = refusalsOf(first.reply, context);
  if (refused.length === 0) return { answer: answerOf(first.reply, context), usage: [first.usage] };
  const again = await compose(prompts.system, `${prompts.user}\n\nYOUR LAST ANSWER WAS REFUSED:\n${refused.map((reason) => `- ${reason}`).join('\n')}\nAnswer again.`, ReplySchema);
  const usage = [first.usage, again.usage];
  if ('unfit' in again) return { refused: [again.unfit], usage };
  const still = refusalsOf(again.reply, context);
  return still.length === 0 ? { answer: answerOf(again.reply, context), usage } : { refused: still, usage };
};
