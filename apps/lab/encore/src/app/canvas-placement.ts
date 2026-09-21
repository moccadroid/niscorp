// WHERE EACH CARD LANDS — action id → canvas id, in one place.
//
// Every region of the room is a question (PLAN.md § The shell), and a card's
// position comes from which canvas it lands on, never from an order within one:
// nova has no verb to reorder instances, and a room whose cards jump is worse
// than one whose cards do not. So placement is a fact about the ACTION, static
// and authored, and the model is never asked it — it decides whether a card
// belongs on screen, not where.
//
// An action absent from this record is not mountable by the loop. That is how
// the three frame actions stay furniture: `intent.line` is never a question.

export const QUESTION_CANVASES = ['doing', 'about', 'where', 'when', 'nearby'] as const;

export type QuestionCanvas = (typeof QUESTION_CANVASES)[number];

// A CARD THAT STANDS BESIDE ANOTHER. When the lead card is on screen its
// companion is wanted too, whatever Jev thought of it alone — and is aimed by
// the lead's own values for the fields they share. A move without its
// consequences is half a card; and "whenever a swap is wanted" must not depend
// on a second probability clearing a line, because a calibrated model's
// opinion of the companion is usually middling.
export const COMPANIONS: Record<string, string> = { 'move.impact': 'slot.swap' };

export const CANVAS_PLACEMENT: Record<string, QuestionCanvas> = {
  'slot.swap': 'doing',
  'set.delay': 'doing',
  'push.compose': 'doing',
  'act.card': 'about',
  'stage.view': 'about',
  'site.map': 'where',
  'lineup.timeline': 'when',
  'weather.radar': 'when',
  'crowd.gauge': 'nearby',
  'attendance.now': 'nearby',
  'situation.now': 'nearby',
  'incident.feed': 'nearby',
  'move.impact': 'nearby',
  'sales.chart': 'nearby',
};

// ─── the flow ────────────────────────────────────────────────
// MEANING BY COLOUR, NOT POSITION. The room is one packed flow (shell/
// calm.layout.ts), so where a card sits says nothing about what it is; its
// canvas — the question it answers — is said by one restrained hue on its edge
// and a small tag. Five of the kit's hues, one per question. Amber and red are
// not among them: they mean severity, everywhere.
export type CardCategory = { tag: string; hue: 'teal' | 'violet' | 'blue' | 'lime' | 'pink'; question: string };

export const CATEGORIES: Record<QuestionCanvas, CardCategory> = {
  doing: { tag: 'Doing', hue: 'teal', question: 'what are you doing?' },
  about: { tag: 'About', hue: 'violet', question: 'who or what is this about?' },
  when: { tag: 'When', hue: 'blue', question: 'when is it?' },
  where: { tag: 'Where', hue: 'lime', question: 'where is it?' },
  nearby: { tag: 'Context', hue: 'pink', question: 'what else matters?' },
};

// The order the flow reads in: what you are doing, who or what, when, where,
// what else. (QUESTION_CANVASES keeps its own order — the loop's, and the
// checks'.)
export const FLOW_ORDER: readonly QuestionCanvas[] = ['doing', 'about', 'when', 'where', 'nearby'];

// HOW WIDE A CARD MAY BE, in the pack's own terms: the running order is wide, a
// dial is compact, everything else regular. (Records were compact at first, and a
// form beside one record left a quarter of the row empty: `regular` and `wide`
// always sum to a row, `compact` only in pairs — so it is kept for the one card
// that is genuinely small.) Nothing stretches to fill a row and nothing is given
// a column; the pack decides the rest.
export type CardSpan = 'wide' | 'regular' | 'compact';

export const CARD_SPAN: Record<string, CardSpan> = {
  'slot.swap': 'regular',
  'set.delay': 'regular',
  'push.compose': 'regular',
  'act.card': 'regular',
  'stage.view': 'regular',
  'site.map': 'regular',
  'lineup.timeline': 'wide',
  'weather.radar': 'regular',
  'crowd.gauge': 'compact',
  'attendance.now': 'regular',
  'situation.now': 'regular',
  'incident.feed': 'regular',
  'move.impact': 'regular',
  'sales.chart': 'regular',
};

// What every mount hands the card's chrome (the `placed` and `raised`
// fragments): its size class, its hue, its tag. One function, because three
// things put cards up — Jev, the assistant, the watcher — and they must agree.
export const TILE_SPAN = 'tileSpan';
export const TILE_HUE = 'tileHue';
export const TILE_TAG = 'tileTag';

export const tileOf = (actionId: string, canvas: string | undefined = CANVAS_PLACEMENT[actionId]): Record<string, string> => {
  const category = QUESTION_CANVASES.find((id) => id === canvas);
  return {
    [TILE_SPAN]: CARD_SPAN[actionId] ?? 'regular',
    [TILE_HUE]: category === undefined ? 'teal' : CATEGORIES[category].hue,
    [TILE_TAG]: category === undefined ? '' : CATEGORIES[category].tag,
  };
};
