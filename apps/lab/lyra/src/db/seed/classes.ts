// The weekly grid, the term of sessions generated from it, and the two beats
// the demo needs on the timetable itself.
import { day, insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

export const TEMPLATES_SQL = insert(
  'class_templates',
  ['id', 'studio_id', 'program_id', 'name', 'weekday', 'starts_at', 'duration_mins', 'capacity', 'instructor_id', 'active'],
  [
    ['ct_l_mon_am', LUMEN, 'pr_vinyasa', 'Morning Flow', 1, '07:30', 60, 24, 'sf_maren', true],
    ['ct_l_tue_pm', LUMEN, 'pr_yin', 'Yin & Restore', 2, '19:00', 75, 18, 'sf_tobias', true],
    ['ct_l_wed_am', LUMEN, 'pr_vinyasa', 'Morning Flow', 3, '07:30', 60, 24, 'sf_tobias', true],
    ['ct_l_thu_pm', LUMEN, 'pr_beginners', 'Foundations', 4, '18:00', 60, 14, 'sf_maren', true],
    ['ct_l_fri_am', LUMEN, 'pr_vinyasa', 'Morning Flow', 5, '07:30', 60, 24, 'sf_tobias', true],
    ['ct_l_sat_am', LUMEN, 'pr_vinyasa', 'Saturday Open', 6, '09:30', 90, 30, 'sf_maren', true],

    ['ct_n_mon_pm', NORTHROCK, 'pr_gi', 'Gi', 1, '18:30', 90, 28, 'sf_dario', true],
    ['ct_n_mon_fund', NORTHROCK, 'pr_fundamentals', 'Fundamentals', 1, '17:15', 60, 16, 'sf_kaya', true],
    ['ct_n_tue_pm', NORTHROCK, 'pr_nogi', 'No-Gi', 2, '18:30', 90, 28, 'sf_kaya', true],
    ['ct_n_wed_pm', NORTHROCK, 'pr_gi', 'Gi', 3, '18:30', 90, 28, 'sf_dario', true],
    ['ct_n_wed_fund', NORTHROCK, 'pr_fundamentals', 'Fundamentals', 3, '17:15', 60, 16, 'sf_kaya', true],
    ['ct_n_thu_pm', NORTHROCK, 'pr_nogi', 'No-Gi', 4, '18:30', 90, 28, 'sf_kaya', true],
    ['ct_n_fri_pm', NORTHROCK, 'pr_gi', 'Open Mat', 5, '18:30', 120, 30, 'sf_dario', true],
    ['ct_n_sat_am', NORTHROCK, 'pr_comp', 'Competition', 6, '10:00', 120, 12, 'sf_dario', true],
  ],
);

export const COURSE_TEMPLATES_SQL = insert(
  'class_templates',
  ['id', 'studio_id', 'program_id', 'course_id', 'name', 'weekday', 'starts_at', 'duration_mins', 'capacity', 'instructor_id', 'starts_on', 'ends_on', 'active'],
  [
    ['ct_l_found_block', LUMEN, 'pr_beginners', 'co_lumen_found', 'Foundations block', 6, '11:00', 75, 12, 'sf_maren', day(3, LUMEN), day(3 + 35, LUMEN), true],
    ['ct_n_intake_block', NORTHROCK, 'pr_fundamentals', 'co_rock_intake', 'Intake', 2, '17:15', 60, 16, 'sf_kaya', day(2, NORTHROCK), day(2 + 21, NORTHROCK), true],
  ],
);

// ─── generated: a term of sessions ───────────────────────────
export const SESSIONS_SQL = /* sql */ `
  INSERT INTO class_sessions
    (id, studio_id, template_id, program_id, name, held_on, starts_at, duration_mins, capacity, instructor_id, status, week_key, hour_key)
  SELECT
    t.id || ':' || to_char(gs.d, 'YYYYMMDD'),
    t.studio_id, t.id, t.program_id, t.name,
    gs.d::date, t.starts_at, t.duration_mins, t.capacity, t.instructor_id,
    'scheduled',
    to_char(gs.d, 'IYYY"-W"IW'),
    split_part(t.starts_at, ':', 1)::int
  FROM class_templates t
  CROSS JOIN generate_series(studio_today(t.studio_id) - 56, studio_today(t.studio_id) + 21, '1 day'::interval) AS gs(d)
  WHERE t.active
    AND EXTRACT(DOW FROM gs.d) = t.weekday
    AND (t.starts_on IS NULL OR gs.d >= t.starts_on)
    AND (t.ends_on IS NULL OR gs.d <= t.ends_on)
  ON CONFLICT (id) DO NOTHING;
`;

// One cancelled class, so the schedule has to render a hole rather than a
// gap. Next Tuesday at Lumen — Tobias is away.
export const CANCELLATION_SQL = /* sql */ `
  UPDATE class_sessions SET status = 'cancelled'
  WHERE template_id = 'ct_l_tue_pm'
    AND held_on > studio_today('${LUMEN}')
    AND held_on <= studio_today('${LUMEN}') + 7;
`;

// A class happening TODAY with somebody already booked into it, so the desk
// screen has something to check people in to. Seeded after the check-ins
// below, which is why nobody has attended it.
export const TODAY_CLASS_SQL = /* sql */ `
  INSERT INTO class_sessions (id, studio_id, program_id, name, held_on, starts_at, duration_mins, capacity, instructor_id, status, week_key, hour_key)
  SELECT 'cs_today_lumen', 'st_lumen', 'pr_vinyasa', 'Open Practice', studio_today('${LUMEN}'), '12:00', 60, 12, NULL, 'scheduled',
         to_char(studio_today('${LUMEN}'), 'IYYY"-W"IW'), 12
  WHERE NOT EXISTS (SELECT 1 FROM class_sessions WHERE id = 'cs_today_lumen');

  INSERT INTO bookings (id, studio_id, session_id, person_id, status, booked_at)
  SELECT 'bk_today_ava', 'st_lumen', 'cs_today_lumen', 'p_ava', 'booked', now()
  WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE id = 'bk_today_ava');
`;
