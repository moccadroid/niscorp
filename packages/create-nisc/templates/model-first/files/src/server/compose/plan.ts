import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import type { Canvas } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { areasInLayout, arrangementFor } from './layout';
import type { WrittenLayout } from './layout';

export type AreaCanvases = Partial<Record<AreaId, Canvas>>;

export type Said = { title: string; text: string };

// Each area's canvas sits in an array, as nova's `reconcile` takes it.
export type Plan = {
  question: string;
  response?: string;
  label: string;
  screen?: string;
  canvases: Partial<Record<AreaId, Canvas[]>>;
  arrangement: string;
  layout: LayoutNode;
};

export type ShownPlan = Plan & { position: number; total: number; stack: { position: number; label: string }[] };

export const wordsCanvas = (said: Said): Canvas => ({ action: 'answer.text', input: { title: said.title, text: said.text }, intent: `the words "${said.title}"` });

export const canvasesInAreas = (canvases: readonly Canvas[]): AreaCanvases => Object.fromEntries(canvases.slice(0, AREAS.length).map((canvas, at) => [AREAS[at], canvas]));

export const canvasesOfPlan = (plan: Plan): AreaCanvases => Object.fromEntries(AREAS.flatMap((area) => plan.canvases[area]?.slice(0, 1).map((canvas) => [area, canvas]) ?? []));

export const changedAreas = (now: Plan, before: Plan): AreaId[] =>
  AREAS.filter((area) => now.canvases[area] !== undefined && JSON.stringify(now.canvases[area]) !== JSON.stringify(before.canvases[area]));

export const arrangementOfPlan = (plan: Plan): string | WrittenLayout => (plan.arrangement === 'written' ? { layout: plan.layout, areas: areasInLayout(plan.layout) } : plan.arrangement);

type PlanOptions = { arrangements: readonly Arrangement[]; arrangement: string | WrittenLayout; label?: string; screen?: { id: string; label: string } };

export const planOf = (question: string, canvases: AreaCanvases, options: PlanOptions): Plan => ({
  question,
  label: options.screen?.label ?? options.label ?? question,
  ...(options.screen !== undefined ? { screen: options.screen.id } : {}),
  canvases: Object.fromEntries(AREAS.flatMap((area) => (canvases[area] !== undefined ? [[area, [canvases[area]]]] : []))),
  ...arrangementFor(options.arrangement, options.arrangements),
});
