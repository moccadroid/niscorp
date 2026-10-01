import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the talk, put back to how it starts ──
//
// A reset is ordinary writes: the speaker's, replayed in order by one server
// function (server/functions/reset.functions.ts). Going through vex is the
// point — every reactive read on every screen follows, so the joined count,
// the register and the controller's lists empty on their own.
//
// Each delete names what it deletes — the people who joined, the names
// refused, the speaker's own timers — so the write is bounded by what the
// caller passed (vex's lint asks for it). `people` is everybody who joined
// plus the speaker, who has an assistant conversation too.

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
// Everything given during the talk: the X-ray, the assistant, the button.
export const resetGrants = ofPeople('reset/grants', 'grants', 'principal', 'Reset: take back every role given to the people in the list');
export const resetMembers = ofPeople('reset/members', 'members', 'member_id', 'Reset: delete the people in the list — they have not joined');

export const resetTimers: SeedMutation = {
  fingerprint: 'reset/timers',
  intent: 'Reset: delete every timer this person saved',
  mutation: { op: 'delete', table: 'timers', where: { eq: ['timers.saved_by', { $context: 'savedBy' }] } },
};

// The names somebody typed that were refused: read, then deleted by id.
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
