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
