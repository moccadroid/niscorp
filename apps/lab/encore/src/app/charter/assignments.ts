// Principal → roles. Two seeded people, one per rung; a real festival mints one
// per lanyard and nothing else moves.
//
// Dev-grade identity, the lab's stated posture: the runtime is `dev-open`, so a
// token that names one of these ids IS that person. The page mints the
// operator's (main.tsx); the checks mint both.
export const OPERATOR_PRINCIPAL = 'op_ada';
export const LIAISON_PRINCIPAL = 'vl_ilse';
// Not a person: the feed. Tonight it is a director playing Saturday evening;
// what matters is that it is a PRINCIPAL, with a role, entering by the door.
export const DIRECTOR_PRINCIPAL = 'feed_director';

export const ASSIGNMENTS: Record<string, readonly string[]> = {
  [OPERATOR_PRINCIPAL]: ['operator'],
  [LIAISON_PRINCIPAL]: ['vendor-liaison'],
  [DIRECTOR_PRINCIPAL]: ['director'],
};
