import { actions } from '../../app/action-catalog';
import type { Canvas } from '../../app/screens';
import { drawnAreas, MARK_WORDS } from './layout';
import type { DrawnArea } from './layout';
import type { ShownPlan } from './plan';

export type DeckLayer = DrawnArea & { mark?: string; title: string; text: string };

export type DeckEntry = { position: number; label: string; question: string; response: string; screen: boolean; showing: boolean; columns: number; layers: DeckLayer[] };

const wordsOf = (canvas: Canvas | undefined, key: string): string => {
  const value = canvas?.input[key];
  return typeof value === 'string' ? value : '';
};

export const deckOf = (plans: readonly ShownPlan[], showing: number): DeckEntry[] =>
  plans.map((plan) => {
    const { columns, areas } = drawnAreas(plan);
    return {
      position: plan.position,
      label: plan.label,
      question: plan.question,
      response: plan.response ?? '',
      screen: plan.screen !== undefined,
      showing: plan.position === showing,
      columns,
      layers: areas.map((area) => {
        const canvas = plan.canvases[area.name]?.[0];
        const title = wordsOf(canvas, 'title');
        return { ...area, ...(area.fresh !== undefined ? { mark: MARK_WORDS[area.fresh] } : {}), title: title !== '' ? title : (actions[canvas?.action ?? '']?.title ?? ''), text: wordsOf(canvas, 'text') };
      }),
    };
  });
