import type { LayoutNode } from '@niscorp/nova';
import type { PreparedAnswer } from '../../app/answers';
import { ARRANGEMENTS } from '../../app/arrangements';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';

// What an area holds: the prepared answer it is (`text` for words the model wrote), and the action nova's `reconcile`
// places, opened with its input.
export type Placed = { answer: string; action: string; input: Record<string, unknown> };

// What a message, or a screen opened from the menu, was answered with; where it stands among the answers given, and
// what they all were (`stack`), to go back to any of them.
export type Plan = {
  question: string;
  label: string;
  screen?: string;
  position: number;
  total: number;
  stack: { position: number; label: string }[];
  answers: string[];
  canvases: Partial<Record<AreaId, Placed[]>>;
  arrangement: string;
  layout: LayoutNode;
};

export type Unnumbered = Omit<Plan, 'position' | 'total' | 'stack'>;

// A prepared answer, and the values it is opened with beyond its own input: by path into the input.
export type Chosen = { answer: PreparedAnswer; values: Record<string, unknown> };

export type Said = { title: string; text: string };

// A layout the model wrote, and how many answers it holds.
export type Written = { layout: LayoutNode; slots: number };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const withValue = (into: unknown, path: readonly string[], value: unknown): unknown => {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (Array.isArray(into)) return into.map((item, at) => (String(at) === head ? withValue(item, rest, value) : item));
  const record = isRecord(into) ? into : {};
  return { ...record, [head]: withValue(record[head], rest, value) };
};

export const placedOf = (chosen: Chosen): Placed => ({
  answer: chosen.answer.id,
  action: chosen.answer.action,
  input: Object.entries(chosen.values).reduce<Record<string, unknown>>((input, [path, value]) => withValue(input, path.split('.'), value) as Record<string, unknown>, chosen.answer.input),
});

export const textOf = (said: Said, examples: readonly string[]): Placed => ({ answer: 'text', action: 'answer.text', input: { title: said.title, text: said.text, examples: [...examples] } });

// Words the answer says come first. Of the rest, what is already on screen keeps its order — the same answer with the
// same input, else the same answer with another — and what is new follows it; then they fill the areas in order,
// with no gap. Two answers that stay never trade places in front of the person.
const arranged = (entries: readonly Placed[], onScreen: Unnumbered['canvases']): Unnumbered['canvases'] => {
  const said = entries.filter((entry) => entry.action === 'answer.text');
  const left = entries.filter((entry) => entry.action !== 'answer.text').slice(0, AREAS.length - said.length);
  const staying: Placed[] = [...said];
  for (const there of AREAS.flatMap((area) => onScreen[area] ?? [])) {
    const exact = left.findIndex((entry) => entry.answer === there.answer && JSON.stringify(entry.input) === JSON.stringify(there.input));
    const at = exact >= 0 ? exact : left.findIndex((entry) => entry.answer === there.answer);
    if (at >= 0) staying.push(...left.splice(at, 1));
  }
  return Object.fromEntries([...staying, ...left].map((entry, at) => [AREAS[at], [entry]]));
};

// The arrangement asked for — by name, or written — when it holds every answer; else the smallest one that does.
const laidOut = (asked: string | Written | undefined, count: number): { arrangement: string; layout: LayoutNode } => {
  if (typeof asked === 'object' && asked.slots >= count) return { arrangement: 'written', layout: asked.layout };
  const named = ARRANGEMENTS.find((arrangement) => arrangement.id === asked && arrangement.slots >= count);
  const fits = named ?? [...ARRANGEMENTS].filter((arrangement) => arrangement.slots >= count).sort((one, other) => one.slots - other.slots)[0] ?? ARRANGEMENTS[ARRANGEMENTS.length - 1];
  return { arrangement: fits?.id ?? '', layout: fits?.layout ?? { component: 'Answers' } };
};

// A plan for a message is named by it, and one for a screen by the screen's label.
export const planOf = (
  question: string,
  entries: readonly Placed[],
  onScreen: Unnumbered['canvases'],
  how: { screen?: { id: string; label: string }; arrangement?: string | Written } = {},
): Unnumbered => {
  // A grid the model wrote is laid out for the answers in the order it gave them: that order stands.
  const ownOrder = typeof how.arrangement === 'object' && how.arrangement.slots >= Math.min(entries.length, AREAS.length);
  const canvases = arranged(entries, ownOrder ? {} : onScreen);
  const answers = AREAS.flatMap((area) => canvases[area] ?? []).map((entry) => entry.answer);
  return {
    question,
    label: how.screen?.label ?? question,
    ...(how.screen !== undefined ? { screen: how.screen.id } : {}),
    answers,
    canvases,
    ...laidOut(how.arrangement, answers.length),
  };
};

export const samePlan = (one: Unnumbered, other: Unnumbered): boolean => JSON.stringify([one.canvases, one.layout]) === JSON.stringify([other.canvases, other.layout]);
