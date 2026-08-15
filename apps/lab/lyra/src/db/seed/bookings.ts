// Who booked, who turned up, and the two people who stopped coming.
import { at, day, insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

// Whoever holds a live subscription books — the entitlement, not a category,
// is what puts somebody in class.
export const BOOKINGS_SQL = /* sql */ `
  INSERT INTO bookings (id, studio_id, session_id, person_id, status, booked_at)
  SELECT
    'bk_' || substr(md5(m.person_id || s.id), 1, 16),
    s.studio_id, s.id, m.person_id,
    'booked',
    (s.held_on - 3)::timestamptz + interval '11 hours'
  FROM class_sessions s
  JOIN (SELECT DISTINCT studio_id, person_id FROM subscriptions WHERE status = 'active') m
    ON m.studio_id = s.studio_id
  WHERE s.status = 'scheduled'
    AND s.held_on BETWEEN studio_today(s.studio_id) - 56 AND studio_today(s.studio_id) + 7
    AND ((('x' || substr(md5(m.person_id || s.id), 1, 7))::bit(28)::int) % 100) < 34
    -- AND TWO PEOPLE STOPPED COMING — in the data, not only in a note.
    --
    -- studio_people calls Jonas "an active member who has stopped coming", but
    -- only the opt-out half of that was ever seeded; his attendance came from
    -- the same 34% lottery as everybody else's, over a window that moves with
    -- the calendar. So whether the one automation that hunts for quiet members
    -- had anything to find was luck, and it ran out: every active Lumen member
    -- had attended within three days, "who has stopped coming" answered nobody
    -- at every cutoff, and automations-check failed on the guard that exists to
    -- catch exactly that — three answers agreeing on a constant.
    --
    -- THEY ARE THE TWO HALVES OF THE SAME QUESTION, and one alone cannot pose
    -- it. Jonas is quiet and opted OUT, so the selection must skip him — but
    -- being skipped, he can never move the count either. Sofia is quiet and
    -- opted IN, so she is the one it must find, and the one whose last class
    -- makes the answer depend on where the cutoff falls.
    --
    -- Sofia is the honest shape for this: a yearly plan does not lapse, so
    -- nothing else in the app would ever raise its hand about her. Three weeks
    -- for Jonas and ten days for Sofia keep both unambiguous at the cutoffs
    -- automations-check uses, and leave both plenty of older classes — a member
    -- who never came is a different shape from one who stopped.
    AND NOT (m.person_id = 'p_jonas' AND s.held_on > studio_today(s.studio_id) - 21)
    AND NOT (m.person_id = 'p_sofia' AND s.held_on > studio_today(s.studio_id) - 10);
`;

export const CHECK_INS_SQL = /* sql */ `
  INSERT INTO check_ins (id, studio_id, person_id, session_id, happened_at, held_on, hour_key, method)
  SELECT
    'ci_' || substr(md5('att' || b.id), 1, 16),
    b.studio_id, b.person_id, b.session_id,
    s.held_on::timestamptz + (s.starts_at || ':00')::time - interval '6 minutes',
    s.held_on,
    s.hour_key,
    CASE WHEN ((('x' || substr(md5('m' || b.id), 1, 7))::bit(28)::int) % 100) < 70 THEN 'kiosk' ELSE 'desk' END
  FROM bookings b
  JOIN class_sessions s ON s.id = b.session_id
  WHERE s.held_on < studio_today(s.studio_id)
    AND ((('x' || substr(md5('att' || b.id), 1, 7))::bit(28)::int) % 100) < 82;
`;

// ─── one authored beat ───────────────────────────────────────
export const WALK_IN_SQL = insert(
  'check_ins',
  ['id', 'studio_id', 'person_id', 'session_id', 'happened_at', 'held_on', 'hour_key', 'method'],
  [['ci_hana_walkin', NORTHROCK, 'p_hana', null, at(-2, 17, 9, NORTHROCK), day(-2, NORTHROCK), 17, 'desk']],
);

export const ATTENDANCE_SQL = /* sql */ `
  UPDATE bookings b
  SET attended = EXISTS (SELECT 1 FROM check_ins c WHERE c.session_id = b.session_id AND c.person_id = b.person_id);
`;

export const MEMBER_DIARY_SQL = /* sql */ `
  INSERT INTO bookings (studio_id, session_id, person_id)
  SELECT '${LUMEN}', cs.id, 'p_ava'
  FROM class_sessions cs
  WHERE cs.studio_id = '${LUMEN}'
    AND cs.held_on > studio_today(cs.studio_id)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = cs.id AND b.person_id = 'p_ava')
  ORDER BY cs.held_on ASC, cs.starts_at ASC
  LIMIT 2;
`;
