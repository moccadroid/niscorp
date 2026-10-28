import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import type { Canvas } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { areasInLayout, arrangementFor } from './layout';
import type { WrittenLayout } from './layout';

export type AreaCanvases = Partial<Record<AreaId, Canvas>>;

export type Said = { title: string; text: string };

// Each answer to a message takes the next of these, in turn; what colour each is, is the kit's.
export const ANSWER_INKS = ['turn-1', 'turn-2', 'turn-3', 'turn-4', 'turn-5'] as const;

export type Mark = 'changed' | 'new';

// Each area's canvas sits in an array, as nova's `reconcile` takes it. A card keeps the ink of the answer that put it
// there; `marks` says what this answer did to an area; `shows`, what each card showed when the person last left it. An
// answer to a message has the id of its row; a screen has none.
export type Plan = {
  id?: string;
  question: string;
  response?: string;
  label: string;
  screen?: string;
  canvases: Partial<Record<AreaId, Canvas[]>>;
  arrangement: string;
  layout: LayoutNode;
  ink: string;
  inks: Partial<Record<AreaId, string>>;
  marks: Partial<Record<AreaId, Mark>>;
  shows?: Partial<Record<AreaId, Record<string, unknown>>>;
};

// `next` is the ink of the answer the line asks for; `later`, of the one after it, which the line takes while it is asked.
// `said` is what the model said back to the message just answered.
export type ShownPlan = Plan & { position: number; total: number; stack: { position: number; label: string; ink: string }[]; next: string; later: string; said?: string };

export const wordsCanvas = (said: Said): Canvas => ({ action: 'answer.text', input: { title: said.title, text: said.text }, intent: `the words "${said.title}"` });

export const canvasesInAreas = (canvases: readonly Canvas[]): AreaCanvases => Object.fromEntries(canvases.slice(0, AREAS.length).map((canvas, at) => [AREAS[at], canvas]));

export const canvasesOfPlan = (plan: Plan): AreaCanvases => Object.fromEntries(AREAS.flatMap((area) => plan.canvases[area]?.slice(0, 1).map((canvas) => [area, canvas]) ?? []));

export const arrangementOfPlan = (plan: Plan): string | WrittenLayout => (plan.arrangement === 'written' ? { layout: plan.layout, areas: areasInLayout(plan.layout) } : plan.arrangement);

type PlanOptions = { arrangements: readonly Arrangement[]; arrangement: string | WrittenLayout; ink: string; label?: string; screen?: { id: string; label: string } };

const placedIn = (plan: Pick<Plan, 'canvases'>): AreaId[] => AREAS.filter((area) => plan.canvases[area] !== undefined);

export const planOf = (question: string, canvases: AreaCanvases, options: PlanOptions): Plan => {
  const plan = {
    question,
    label: options.screen?.label ?? options.label ?? question,
    ...(options.screen !== undefined ? { screen: options.screen.id } : {}),
    canvases: Object.fromEntries(AREAS.flatMap((area) => (canvases[area] !== undefined ? [[area, [canvases[area]]]] : []))),
    ...arrangementFor(options.arrangement, options.arrangements),
  };
  return { ...plan, ink: options.ink, inks: Object.fromEntries(placedIn(plan).map((area) => [area, options.ink])), marks: {} };
};

// An answer after `before`: a card it left as it was keeps the ink it had; one it wrote is in the answer's own ink, and
// marked as changed, or as new where the area was empty.
export const inked = (plan: Plan, before: Plan): Plan => {
  const kept = (area: AreaId): boolean => JSON.stringify(plan.canvases[area]) === JSON.stringify(before.canvases[area]);
  const placed = placedIn(plan);
  return {
    ...plan,
    inks: Object.fromEntries(placed.map((area) => [area, kept(area) ? (before.inks[area] ?? before.ink) : plan.ink])),
    marks: Object.fromEntries(placed.filter((area) => !kept(area)).map((area) => [area, before.canvases[area] === undefined ? 'new' : 'changed'])),
  };
};
