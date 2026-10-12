export const OPERATOR_PRINCIPAL = 'op_ada';
export const LIAISON_PRINCIPAL = 'vl_ilse';
export const DIRECTOR_PRINCIPAL = 'feed_director';

export const ASSIGNMENTS: Record<string, readonly string[]> = {
  [OPERATOR_PRINCIPAL]: ['operator'],
  [LIAISON_PRINCIPAL]: ['vendor-liaison'],
  [DIRECTOR_PRINCIPAL]: ['director'],
};
