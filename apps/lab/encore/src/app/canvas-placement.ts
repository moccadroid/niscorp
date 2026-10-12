export const QUESTION_CANVASES = ['doing', 'about', 'where', 'when', 'nearby'] as const;

export type QuestionCanvas = (typeof QUESTION_CANVASES)[number];

// Companion → lead. When the lead is on screen its companion is wanted too, whatever
// the model thought of it alone, aimed by the lead's values for the fields they share.
export const COMPANIONS: Record<string, string> = { 'move.impact': 'slot.swap' };

// An action absent from here is not mountable by the intent loop.
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

// Amber and red are not among the hues: they mean severity, everywhere.
export type CardCategory = { tag: string; hue: 'teal' | 'violet' | 'blue' | 'lime' | 'pink'; question: string };

export const CATEGORIES: Record<QuestionCanvas, CardCategory> = {
  doing: { tag: 'Doing', hue: 'teal', question: 'what are you doing?' },
  about: { tag: 'About', hue: 'violet', question: 'who or what is this about?' },
  when: { tag: 'When', hue: 'blue', question: 'when is it?' },
  where: { tag: 'Where', hue: 'lime', question: 'where is it?' },
  nearby: { tag: 'Context', hue: 'pink', question: 'what else matters?' },
};

// QUESTION_CANVASES keeps its own order: the loop's, and the checks'.
export const FLOW_ORDER: readonly QuestionCanvas[] = ['doing', 'about', 'when', 'where', 'nearby'];

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
