import type { LayoutNode } from '@niscorp/nova';
import { ARRANGEMENTS } from '../../app/arrangements';
import type { Canvas } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';

// What a message, or a screen opened from the menu, was answered with: a canvas for each area, in an array as nova's
// `reconcile` takes it; where it stands among the answers given, and what they all were (`stack`).
export type Plan = {
  question: string;
  label: string;
  screen?: string;
  position: number;
  total: number;
  stack: { position: number; label: string }[];
  canvases: Partial<Record<AreaId, Canvas[]>>;
  arrangement: string;
  layout: LayoutNode;
};

export type Unnumbered = Omit<Plan, 'position' | 'total' | 'stack'>;

export type Said = { title: string; text: string };

// A layout the model wrote, and how many canvases it holds.
export type Written = { layout: LayoutNode; slots: number };

export const textOf = (said: Said, examples: readonly string[]): Canvas => ({ action: 'answer.text', input: { title: said.title, text: said.text, examples: [...examples] }, intent: 'words' });

const same = (one: unknown, other: unknown): boolean => JSON.stringify(one) === JSON.stringify(other);

// Words come first. Of the rest, what is already on screen keeps its order — the same action with the same input, else
// the same action showing the same read, else the same action — and what is new follows it; then they fill the areas
// in order, with no gap. Two canvases that stay never trade places in front of the person.
const arranged = (canvases: readonly Canvas[], onScreen: Unnumbered['canvases']): Unnumbered['canvases'] => {
  const said = canvases.filter((canvas) => canvas.action === 'answer.text');
  const left = canvases.filter((canvas) => canvas.action !== 'answer.text').slice(0, AREAS.length - said.length);
  const staying: Canvas[] = [...said];
  for (const there of AREAS.flatMap((area) => onScreen[area] ?? [])) {
    const tests = [
      (canvas: Canvas) => canvas.action === there.action && same(canvas.input, there.input),
      (canvas: Canvas) => canvas.action === there.action && canvas.input['read'] !== undefined && canvas.input['read'] === there.input['read'],
      (canvas: Canvas) => canvas.action === there.action,
    ];
    const at = tests.map((test) => left.findIndex(test)).find((index) => index >= 0) ?? -1;
    if (at >= 0) staying.push(...left.splice(at, 1));
  }
  return Object.fromEntries([...staying, ...left].map((canvas, at) => [AREAS[at], [canvas]]));
};

// The arrangement asked for — by name, or written — when it holds every canvas; else the smallest one that does.
const laidOut = (asked: string | Written | undefined, count: number): { arrangement: string; layout: LayoutNode } => {
  if (typeof asked === 'object' && asked.slots >= count) return { arrangement: 'written', layout: asked.layout };
  const named = ARRANGEMENTS.find((arrangement) => arrangement.id === asked && arrangement.slots >= count);
  const fits = named ?? [...ARRANGEMENTS].filter((arrangement) => arrangement.slots >= count).sort((one, other) => one.slots - other.slots)[0] ?? ARRANGEMENTS[ARRANGEMENTS.length - 1];
  return { arrangement: fits?.id ?? '', layout: fits?.layout ?? { component: 'Answers' } };
};

// A plan for a message is named by it, and one for a screen by the screen's label. A grid the model wrote is laid out
// for the canvases in the order it gave them: that order stands.
export const planOf = (
  question: string,
  canvases: readonly Canvas[],
  onScreen: Unnumbered['canvases'],
  how: { screen?: { id: string; label: string }; arrangement?: string | Written } = {},
): Unnumbered => {
  const ownOrder = typeof how.arrangement === 'object' && how.arrangement.slots >= Math.min(canvases.length, AREAS.length);
  const placed = arranged(canvases, ownOrder ? {} : onScreen);
  const count = AREAS.filter((area) => placed[area] !== undefined).length;
  return {
    question,
    label: how.screen?.label ?? question,
    ...(how.screen !== undefined ? { screen: how.screen.id } : {}),
    canvases: placed,
    ...laidOut(how.arrangement, count),
  };
};
