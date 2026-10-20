import { z } from 'zod';
import { LayoutNodeSchema } from '@niscorp/nova';
import type { PreparedAnswer } from '../../app/answers';
import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { Options } from './options';
import { screenShows } from './pick';
import type { Chosen, Said, Written } from './plan';

export type Fill = <T>(system: string, user: string, schema: z.ZodType<T>) => Promise<T>;

// The bounds keep what the model writes to a title and two short sentences: a longer one is sent back to it.
const Reply = z.object({
  answers: z
    .array(z.object({ id: z.string().describe('A prepared answer’s id.'), set: z.record(z.string(), z.string()).optional().describe('Its inputs, by path: only the paths listed for it.') }))
    .max(AREAS.length),
  say: z
    .object({ title: z.string().max(60).describe('A few words.'), text: z.string().max(240).describe('At most two short sentences.') })
    .optional()
    .describe('Words, only where no prepared answer shows what was asked.'),
  arrangement: z.string().optional().describe('The id of the arrangement the answer suits.'),
  layout: z.unknown().optional().describe('A layout of your own, only when no arrangement suits.'),
});

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: unknown, keys: readonly string[]): boolean => isRecord(value) && Object.keys(value).every((key) => keys.includes(key));

// A layout the model writes is a grid and nothing else: `Answers` with its columns, and an `Area` for each answer — the
// first canvases, in order, each holding its own CanvasSlot, each as wide as the columns allow. Anything else is
// refused, and the arrangement asked for by name, or the one that fits, stands.
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

const catalogOf = (answers: readonly PreparedAnswer[], options: Options): string =>
  answers
    .map((answer) => {
      const sets = Object.entries(answer.set ?? {}).map(([path, what]) => `${path}: ${what}`);
      const chooses = [...(options.get(answer) ?? new Map<string, string[]>())].map(([path, values]) => `${path}: one of ${values.map((value) => JSON.stringify(value)).join(', ')} (required)`);
      const inputs = [...chooses, ...sets];
      return `- ${answer.id} — ${answer.shows}${inputs.length > 0 ? `\n  set: ${inputs.join('; ')}` : ''}`;
    })
    .join('\n');

const system = (answers: readonly PreparedAnswer[], screens: readonly Screen[], arrangements: readonly Arrangement[], options: Options): string => `You answer a person's message with a screen. The screen is made of prepared answers; you choose which, fill in their inputs from the message, and choose how they are laid out. The screen is the answer: prefer prepared answers to words, always.

The prepared answers (id — what it shows; the inputs you may set):
${catalogOf(answers, options)}

The screens — prepared answers shown together, chosen by "screen:<id>" as one answer:
${screens.map((screen) => `- screen:${screen.id} — "${screen.label}": ${screenShows(screen, answers)}`).join('\n')}

The arrangements (id — what it suits; how many answers it holds):
${arrangements.map((arrangement) => `- ${arrangement.id} — ${arrangement.suits}; ${arrangement.slots}`).join('\n')}

Reply with { "answers": [{ "id": "...", "set": { "<path>": "<value>" } }], "say": { "title": "...", "text": "..." }, "arrangement": "..." }.
- arrangement: the arrangement the answer suits, one that holds all its answers (words count as one). Only when none suits, leave it out and write "layout" instead: { "component": "Answers", "props": { "columns": 1 to 3 }, "children": [{ "component": "Area", "props": { "name": "a", "span": 1 }, "children": [{ "component": "CanvasSlot", "props": { "canvasId": "a" } }] }, …] } — one Area for each answer, named ${AREAS.join(', ')} in the order of the answers, span the columns it takes.
- answers: the prepared answers, or screens, the message asks for, the most important first, at most ${AREAS.length} in all. Set an input only where the message says what goes in it, and only the paths listed for that answer; an input marked required must be set, from the values listed. A screen takes no inputs.
- say: only when the message asks about this app itself (what it is, what it can do), or asks for something no prepared answer shows. A title of a few words, and at most two short sentences, plain and concrete. Never a paragraph, never a list, never what the screen already shows. Leave it out otherwise.
When nothing fits and there is nothing to say, reply { "answers": [] }.`;

const user = (message: string, quick: readonly Chosen[], screen: readonly string[]): string =>
  [`Message: ${message}`, `A fast picker chose: ${quick.length > 0 ? quick.map((one) => one.answer.id).join(', ') : 'nothing'}`, `On screen before this message: ${screen.length > 0 ? screen.join(', ') : 'nothing'}`].join('\n');

// Rejected whole: an id that is no prepared answer or screen, a path it may not set, a choice that is not among its
// values, or a required choice left out. The fast picker's plan stands instead. A screen is its answers, each once.
// The arrangement is a layout it wrote that holds, else the one it named, else none.
export const fill = async (
  message: string,
  answers: readonly PreparedAnswer[],
  screens: readonly Screen[],
  arrangements: readonly Arrangement[],
  options: Options,
  quick: readonly Chosen[],
  screen: readonly string[],
  fillWith: Fill,
): Promise<{ chosen: Chosen[]; said?: Said; arrangement?: string | Written } | undefined> => {
  const reply = await fillWith(system(answers, screens, arrangements, options), user(message, quick, screen), Reply);
  const chosen: Chosen[] = [];
  const add = (one: Chosen): void => {
    if (!chosen.some((there) => there.answer.id === one.answer.id && JSON.stringify(there.values) === JSON.stringify(one.values))) chosen.push(one);
  };
  for (const one of reply.answers) {
    if (one.id.startsWith('screen:')) {
      const whole = screens.find((candidate) => `screen:${candidate.id}` === one.id);
      if (whole === undefined) return undefined;
      for (const id of whole.answers) {
        const answer = answers.find((candidate) => candidate.id === id && candidate.choose === undefined);
        if (answer !== undefined) add({ answer, values: {} });
      }
      continue;
    }
    const answer = answers.find((candidate) => candidate.id === one.id);
    if (answer === undefined) return undefined;
    const choices = options.get(answer) ?? new Map<string, string[]>();
    const set = one.set ?? {};
    for (const [path, value] of Object.entries(set)) {
      const allowed = choices.get(path);
      if (allowed !== undefined ? !allowed.includes(value) : answer.set?.[path] === undefined) return undefined;
    }
    if ([...choices.keys()].some((path) => set[path] === undefined)) return undefined;
    add({ answer, values: set });
  }
  const written = reply.layout === undefined ? undefined : writtenOf(reply.layout);
  const named = arrangements.some((arrangement) => arrangement.id === reply.arrangement) ? reply.arrangement : undefined;
  const arrangement = written ?? named;
  return {
    chosen,
    ...(reply.say !== undefined && reply.say.text.trim() !== '' ? { said: { title: reply.say.title.trim(), text: reply.say.text.trim() } } : {}),
    ...(arrangement !== undefined ? { arrangement } : {}),
  };
};
