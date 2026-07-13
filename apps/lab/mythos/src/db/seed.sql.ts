// Fixture todos pinned to CURRENT_DATE at seed time — the same value the
// boot reads back and injects as ambient "today", so every date-relative
// view (overdue, combo, streak) stays coherent no matter when the app runs.
//
// The spread is deliberate: 4 done (one today, two yesterday, one the day
// before — a 3-day streak and a 1-todo combo), 5 open with future or no
// dues, 3 overdue (mood starts at "blush" and calms as you garden).
export const SEED_SQL = `
insert into todos (title, notes, due_date, bloom, done, done_at, done_on, created_at) values
  ('Repot the monstera', 'It has outgrown the terracotta pot.', current_date, 'daisy', true, now() - interval '2 hours', current_date, now() - interval '6 days'),
  ('Pay studio rent', '', current_date - 1, 'tulip', true, now() - interval '1 day', current_date - 1, now() - interval '8 days'),
  ('Back up the photo library', 'The good camera roll too.', null, 'fern', true, now() - interval '1 day 3 hours', current_date - 1, now() - interval '9 days'),
  ('Book dentist appointment', '', current_date - 2, 'bell', true, now() - interval '2 days', current_date - 2, now() - interval '10 days'),
  ('Water the balcony herbs', 'The basil looks thirsty.', current_date, 'poppy', false, null, null, now() - interval '1 day'),
  ('Draft the zine intro', 'Two paragraphs, keep it weird.', current_date + 1, 'lotus', false, null, null, now() - interval '2 days'),
  ('Fix the squeaky door hinge', '', current_date + 3, 'daisy', false, null, null, now() - interval '3 days'),
  ('Plan Saturday picnic', 'Invite Mo and Sam.', current_date + 6, 'tulip', false, null, null, now() - interval '1 day'),
  ('Learn three chords on the uke', '', null, 'fern', false, null, null, now() - interval '12 days'),
  ('Return library books', '', current_date - 2, 'bell', false, null, null, now() - interval '7 days'),
  ('Reply to Ana''s letter', 'She asked about the garden.', current_date - 4, 'poppy', false, null, null, now() - interval '9 days'),
  ('Descale the kettle', '', current_date - 1, 'lotus', false, null, null, now() - interval '5 days');
`;
