export type RailPhrase = {
  // Pieces, in order. A piece is dropped whole when its one brace is empty.
  pieces: readonly string[];
};

export const RAIL_PHRASES: Record<string, RailPhrase> = {
  'slot.swap': { pieces: ['moved {actId}', ' → {toStageId}', ', {time}'] },
  'set.delay': { pieces: ['held {actId}', ' {minutes} min'] },
  'push.compose': { pieces: ['drafted a push', ' to {audience}'] },
};

export const SUBMITTED = 'submitted';
export const NOT_SUBMITTED = 'not submitted';
