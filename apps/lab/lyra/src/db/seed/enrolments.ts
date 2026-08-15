// One person on one block, so the fan-out into bookings has something to do.
export const ENROLMENTS_SQL = /* sql */ `
  INSERT INTO enrolments (studio_id, course_id, person_id)
  VALUES ('st_lumen', 'co_lumen_found', 'p_jonas');
`;
