import type { PreparedAnswer } from '../../app/answers';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';

export type Placed = { action: string; input: Record<string, unknown> };

// What a message was answered with: the action each area holds, as nova's `reconcile` places them, and where it
// stands among the answers given so far.
export type Plan = {
  question: string;
  position: number;
  total: number;
  answers: string[];
  canvases: Partial<Record<AreaId, Placed[]>>;
};

export type Unnumbered = Omit<Plan, 'position' | 'total'>;

// A prepared answer, and the values it is opened with beyond its own input: by path into the input.
export type Chosen = { answer: PreparedAnswer; values: Record<string, unknown> };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const withValue = (into: unknown, path: readonly string[], value: unknown): unknown => {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (Array.isArray(into)) return into.map((item, at) => (String(at) === head ? withValue(item, rest, value) : item));
  const record = isRecord(into) ? into : {};
  return { ...record, [head]: withValue(record[head], rest, value) };
};

export const inputOf = (chosen: Chosen): Record<string, unknown> =>
  Object.entries(chosen.values).reduce<Record<string, unknown>>((input, [path, value]) => withValue(input, path.split('.'), value) as Record<string, unknown>, chosen.answer.input);

export const placed = (question: string, chosen: readonly Chosen[]): Unnumbered => ({
  question,
  answers: chosen.map((one) => one.answer.id),
  canvases: Object.fromEntries(chosen.slice(0, AREAS.length).map((one, at) => [AREAS[at], [{ action: one.answer.action, input: inputOf(one) }]])),
});

export const notice = (question: string, title: string, text: string, examples: readonly string[]): Unnumbered => ({
  question,
  answers: [],
  canvases: { a: [{ action: 'answer.notice', input: { title, text, examples: [...examples] } }] },
});

export const samePlan = (one: Unnumbered, other: Unnumbered): boolean => JSON.stringify(one.canvases) === JSON.stringify(other.canvases);
