// The canvases an answer is placed on, most important first.
export const AREAS = ['a', 'b', 'c', 'd'] as const;
export type AreaId = (typeof AREAS)[number];
