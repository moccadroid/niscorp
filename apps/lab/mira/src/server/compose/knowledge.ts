import type { Producer } from '@niscorp/cortex';
import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { Catalog } from './catalog';
import { areaRows } from './layout';
import type { Picks } from './pick';
import { recordOf } from './record';
import type { OpenCanvas } from './screen';

export type ComposerDeps = { catalog: Catalog; screens: readonly Screen[]; arrangements: readonly Arrangement[] };

const json = (value: unknown): string => JSON.stringify(value);

const withoutDialect = (schema: unknown): Record<string, unknown> => Object.fromEntries(Object.entries(recordOf(schema)).filter(([key]) => key !== '$schema'));

export const INSTRUCTIONS = `You answer a person's message with a screen: up to ${AREAS.length} canvases, each an action opened with an input, on the areas ${AREAS.join(', ')} of an arrangement. The screen is the answer: prefer actions to words, always. There is no chat history: the screen open when the message arrives is the conversation, and the message is about it. Change only what the message asks to change; keep everything else exactly where it is. A message that gives values for the fields of a form on screen is about that form, even when it only states them: fill it in, in its area, and keep the rest. The person saves a form, never you.
Your \`response\` is one plain sentence for the person, at most 120 characters: what you change and why, or why nothing changes. Name what they see, never area letters, arrangement names or fingerprints.`;

export const actionCatalog = (({ deps }) =>
  `ACTIONS — what a person sees, and the input schema\n${deps.catalog.actions.map((action) => `- ${action.id}: ${action.description} Input: ${json(withoutDialect(action.schema))}`).join('\n')}`) satisfies Producer<ComposerDeps>;

export const readCatalog = (({ deps }) =>
  `READS — what it answers, its rows, and the params it is asked with\n${deps.catalog.reads.map((read) => `- ${read.fingerprint}: ${read.intent}. Rows: ${json(read.shape)}. Params: ${json(read.contextKeys)}`).join('\n')}`) satisfies Producer<ComposerDeps>;

export const writeCatalog = (({ deps }) =>
  `WRITES — what it does, and the keys of the fields a form saves through it\n${deps.catalog.writes.map((write) => `- ${write.fingerprint}: ${write.intent}. Fields: ${json(write.contextKeys)}`).join('\n')}`) satisfies Producer<ComposerDeps>;

export const screenCatalog = (({ deps }) => `SCREENS\n${deps.screens.map((screen) => `- ${screen.id}: ${screen.description}`).join('\n')}`) satisfies Producer<ComposerDeps>;

export const arrangementCatalog = (({ deps }) =>
  `ARRANGEMENTS — and their areas, row by row\n${deps.arrangements.map((arrangement) => `- ${arrangement.id}: ${arrangement.description} Areas: ${areaRows(arrangement.layout)}`).join('\n')}`) satisfies Producer<ComposerDeps>;

const canvasLine = (canvas: OpenCanvas): string => {
  const what = canvas.action === 'answer.text' ? `words ${json({ title: canvas.input['title'], text: canvas.input['text'] })}` : `input ${json(canvas.input)}`;
  const shows = Object.keys(canvas.shows).length > 0 ? ` — shows ${json(canvas.shows)}` : '';
  return `- ${canvas.area}: ${canvas.action} — ${canvas.intent} — ${what}${shows}`;
};

// A hint that finds nothing likely reads as "nothing belongs in the answer", so the model is not given one.
const picksLine = (picks: Picks): string | undefined => {
  const likely = <T extends { probability: number }>(list: readonly T[], name: (item: T) => string): string[] =>
    list.filter((item) => item.probability >= 0.5).map((item) => `${name(item)} ${item.probability.toFixed(2)}`);
  const kinds = {
    actions: likely(picks.actions, (item) => item.id),
    reads: likely(picks.reads, (item) => item.fingerprint),
    writes: likely(picks.writes, (item) => item.fingerprint),
    screens: likely(picks.screens, (item) => item.id),
  };
  if (Object.values(kinds).every((names) => names.length === 0)) return undefined;
  return Object.entries(kinds)
    .map(([kind, names]) => `${kind} ${names.length > 0 ? names.join(', ') : 'none'}`)
    .join('; ');
};

// The run's input: what is open, what Jev thinks, and the message.
export const messageInput = (message: string, open: readonly OpenCanvas[], arrangement: { id: string; layout: LayoutNode }, picks: Picks | undefined): string => {
  const hint = picks === undefined ? undefined : picksLine(picks);
  return [
    `OPEN SCREEN — arrangement ${arrangement.id}: ${areaRows(arrangement.layout)}`,
    ...(open.length === 0 ? ['nothing'] : open.map(canvasLine)),
    ...(hint === undefined ? [] : ['', `A FAST PICKER THINKS (a hint; how likely each belongs in the answer): ${hint}`]),
    '',
    `MESSAGE: ${message}`,
  ].join('\n');
};
