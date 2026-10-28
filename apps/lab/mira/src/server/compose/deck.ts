import { actions } from '../../app/action-catalog';
import type { Place } from '../../app/shell/screen.layout';
import { placesOfPlan } from './layout';
import type { Card, ShownPlan } from './plan';

export type DeckLayer = Place & { name: string; title: string; text: string; tree?: unknown[] };

export type DeckEntry = { id: string; position: number; label: string; question: string; response: string; screen: boolean; showing: boolean; closable: boolean; columns: number; layers: DeckLayer[] };

const wordsOf = (card: Card, key: string): string => {
  const value = card.input[key];
  return typeof value === 'string' ? value : '';
};

// Each answer as the overview draws it: its cards as nova drew them when the person last left it — the answer shown, as
// they are now — or, never drawn, by their titles and words.
export const deckOf = (plans: readonly ShownPlan[], showing: number, drawnNow: readonly unknown[][]): DeckEntry[] =>
  plans.map((plan) => {
    const places = placesOfPlan(plan);
    const drawn = plan.position === showing ? drawnNow : (plan.drawn ?? []);
    return {
      id: plan.id ?? plan.screen ?? `answer-${plan.position}`,
      position: plan.position,
      label: plan.label,
      question: plan.question,
      response: plan.response ?? '',
      screen: plan.screen !== undefined,
      showing: plan.position === showing,
      closable: plan.position > 1,
      columns: plan.columns,
      layers: plan.cards.flatMap((card, at) => {
        const place = places[at];
        if (place === undefined) return [];
        const title = wordsOf(card, 'title');
        const tree = drawn[at];
        return [{ name: String(at + 1), ...place, title: title !== '' ? title : (actions[card.action]?.title ?? ''), text: wordsOf(card, 'text'), ...(tree !== undefined && tree.length > 0 ? { tree } : {}) }];
      }),
    };
  });
