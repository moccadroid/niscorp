import { actions } from '../../app/action-catalog';
import type { Mark } from '../../app/shell/screen.layout';

export type Said = { title: string; text: string };

// Each answer to a message takes the next of these, in turn; what colour each is, is the kit's.
export const ANSWER_INKS = ['turn-1', 'turn-2', 'turn-3', 'turn-4', 'turn-5'] as const;

// A card of an answer, as nova's `reconcile` takes it and as it is kept. Its key names it among the cards of every
// answer: a card an answer keeps has the key it had, and the screen's reconciler keeps its instance. `ink` is the ink of
// the answer that put it there; `mark`, what the answer it is on did to it.
export type Card = { key: string; action: string; input: Record<string, unknown>; span: number; ink: string; mark?: Mark };

// A card an answer gives, before it is inked.
export type Placed = Omit<Card, 'ink' | 'mark'>;

// An answer to a message has the id of its row; a screen has none. `drawn` is each card as nova drew it when the person
// last left the answer, in order.
export type Plan = { id?: string; question: string; response?: string; label: string; screen?: string; columns: number; cards: Card[]; ink: string; drawn?: unknown[][] };

// `next` is the ink of the answer the line asks for; `later`, of the one after it, which the line takes while it is asked.
// `said` is what the model said back to a message that left the screen as it was.
export type ShownPlan = Plan & { position: number; total: number; stack: { position: number; label: string; ink: string }[]; next: string; later: string; said?: string };

export const wordsInput = (said: Said): Record<string, unknown> => ({ ...actions['answer.text']?.data, title: said.title, text: said.text });

// The cards of an answer after `before`'s: a card it left as it was keeps the ink it had; one it opened is in the
// answer's own ink, marked new; one it wrote into, in the answer's ink, marked changed.
export const inked = (cards: readonly Placed[], before: readonly Card[], ink: string): Card[] =>
  cards.map((card) => {
    const was = before.find((old) => old.key === card.key);
    if (was === undefined) return { ...card, ink, mark: 'new' };
    return JSON.stringify(was.input) === JSON.stringify(card.input) ? { ...card, ink: was.ink } : { ...card, ink, mark: 'changed' };
  });

export const planOf = (question: string, answer: { title: string; columns: number; cards: readonly Placed[] }, before: readonly Card[], ink: string): Plan => ({
  question,
  label: answer.title,
  columns: answer.columns,
  cards: inked(answer.cards, before, ink),
  ink,
});

// What decides whether two answers show the same screen.
export const screenOf = (plan: Plan): string => JSON.stringify([plan.label, plan.columns, plan.cards.map(({ key, action, input, span }) => [key, action, input, span])]);
