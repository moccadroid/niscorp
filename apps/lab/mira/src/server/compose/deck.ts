import { actions } from '../../app/action-catalog';
import type { Canvas } from '../../app/screens';
import { drawnAreas } from './layout';
import type { DrawnArea } from './layout';
import type { ShownPlan } from './plan';

export type DeckLayer = DrawnArea & { title: string; text: string; tree?: unknown[] };

export type DeckEntry = { id: string; position: number; label: string; question: string; response: string; screen: boolean; showing: boolean; closable: boolean; columns: number; layers: DeckLayer[] };

const wordsOf = (canvas: Canvas | undefined, key: string): string => {
  const value = canvas?.input[key];
  return typeof value === 'string' ? value : '';
};

// Each answer as the overview draws it: its cards as nova drew them when the person last left it — the answer shown, as
// they are now — or, never drawn, by their titles and words.
export const deckOf = (plans: readonly ShownPlan[], showing: number, drawnNow: NonNullable<ShownPlan['drawn']>): DeckEntry[] =>
  plans.map((plan) => {
    const { columns, areas } = drawnAreas(plan);
    const drawn = plan.position === showing ? drawnNow : (plan.drawn ?? {});
    return {
      id: plan.id ?? plan.screen ?? `answer-${plan.position}`,
      position: plan.position,
      label: plan.label,
      question: plan.question,
      response: plan.response ?? '',
      screen: plan.screen !== undefined,
      showing: plan.position === showing,
      closable: plan.position > 1,
      columns,
      layers: areas.map((area) => {
        const canvas = plan.canvases[area.name]?.[0];
        const title = wordsOf(canvas, 'title');
        const tree = drawn[area.name];
        return { ...area, title: title !== '' ? title : (actions[canvas?.action ?? '']?.title ?? ''), text: wordsOf(canvas, 'text'), ...(tree !== undefined && tree.length > 0 ? { tree } : {}) };
      }),
    };
  });
