import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// A reset goes through vex, so every reactive read on every screen follows.
const ofPeople = (fingerprint: string, table: string, column: string, intent: string): SeedMutation => ({
  fingerprint,
  intent,
  mutation: { op: 'delete', table, where: { in: [`${table}.${column}`, { $context: 'people' }] } },
});

export const resetPresses = ofPeople('reset/presses', 'presses', 'member_id', 'Reset: delete every press of the button by the people in the list');
// Their verdicts go with them (question_verdicts cascades).
export const resetQuestions = ofPeople('reset/questions', 'questions', 'member_id', 'Reset: delete every question sent by the people in the list');
export const resetQueries = ofPeople('reset/queries', 'queries', 'member_id', 'Reset: delete every query run by the people in the list');
export const resetTurns = ofPeople('reset/turns', 'assistant_turns', 'member_id', 'Reset: delete every assistant conversation of the people in the list');
export const resetGrants = ofPeople('reset/grants', 'grants', 'principal', 'Reset: take back every role given to the people in the list');
export const resetMembers = ofPeople('reset/members', 'members', 'member_id', 'Reset: delete the people in the list — they have not joined');

export const resetTimers: SeedMutation = {
  fingerprint: 'reset/timers',
  intent: 'Reset: delete every timer this person saved',
  mutation: { op: 'delete', table: 'timers', where: { eq: ['timers.saved_by', { $context: 'savedBy' }] } },
};

export const refusedAll: SeedEntry = {
  fingerprint: 'reset/refused',
  intent: 'Every refused name, by id',
  shape: [{ refused_id: '' }],
  dsl: { from: ['refused_names'], fields: ['refused_names.refused_id'], limit: 1000 },
};
export const resetRefused: SeedMutation = {
  fingerprint: 'reset/refused/delete',
  intent: 'Reset: delete the refused names in the list',
  mutation: { op: 'delete', table: 'refused_names', where: { in: ['refused_names.refused_id', { $context: 'refused' }] } },
};

export const RESET_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [resetPresses, resetQuestions, resetQueries, resetTurns, resetGrants, resetMembers, resetTimers, refusedAll, resetRefused];
