import { actions } from '../../app/action-catalog';
import type { Canvas } from '../../app/screens';
import { drawnAreas } from './layout';
import type { DrawnArea } from './layout';
import type { ShownPlan } from './plan';
import { isRecord } from './record';

export type DeckLayer = DrawnArea & { title: string; text: string };

export type DeckEntry = { position: number; label: string; question: string; response: string; screen: boolean; showing: boolean; columns: number; layers: DeckLayer[] };

const wordsOf = (canvas: Canvas | undefined, key: string): string => {
  const value = canvas?.input[key];
  return typeof value === 'string' ? value : '';
};

// What a card filled with data showed, as lines of words: a list as its first rows, each row's words in turn.
const linesOf = (shows: Record<string, unknown> | undefined): string =>
  Object.values(shows ?? {})
    .flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (!isRecord(value) || !Array.isArray(value['first'])) return [];
      return value['first'].map((row) => (isRecord(row) ? Object.values(row).filter((word) => typeof word === 'string' && word !== '').join(' · ') : String(row)));
    })
    .join('\n');

// Each answer as the overview draws it: its cards by their titles and words, or, for a card filled with data, by what it
// showed when the person left it — the answer shown, by what it shows now.
export const deckOf = (plans: readonly ShownPlan[], showing: number, showsNow: NonNullable<ShownPlan['shows']>): DeckEntry[] =>
  plans.map((plan) => {
    const { columns, areas } = drawnAreas(plan);
    const shows = plan.position === showing ? showsNow : (plan.shows ?? {});
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
        const text = wordsOf(canvas, 'text');
        return { ...area, title: title !== '' ? title : (actions[canvas?.action ?? '']?.title ?? ''), text: text !== '' ? text : linesOf(shows[area.name]) };
      }),
    };
  });
