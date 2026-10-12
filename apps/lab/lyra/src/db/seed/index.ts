import { VOCABULARY_SQL } from './vocabulary';
import { THEMES_SQL } from './themes';
import { PHRASES_SQL } from './phrases';
import { LUMEN, NORTHROCK, STUDIOS_SQL } from './studios';
import { CONNECTIONS_SQL, GUARDIANSHIPS_SQL, PEOPLE_SQL, STAFF_SQL, STUDIO_PEOPLE_SQL } from './people';
import { OFFERINGS_SQL } from './offerings';
import { SUBSCRIPTIONS_SQL } from './subscriptions';
import { NOTICES_SQL } from './notices';
import { PASSES_SQL } from './passes';
import { COURSES_SQL, COURSE_OFFERINGS_SQL, PROGRAMS_SQL } from './programs';
import { CANCELLATION_SQL, COURSE_TEMPLATES_SQL, SESSIONS_SQL, TEMPLATES_SQL, TODAY_CLASS_SQL } from './classes';
import { ATTENDANCE_SQL, BOOKINGS_SQL, CHECK_INS_SQL, MEMBER_DIARY_SQL, WALK_IN_SQL } from './bookings';
import { ENROLMENTS_SQL } from './enrolments';
import { AUTOMATIONS_SQL } from './automations';

export { LUMEN, NORTHROCK };

export const buildSeedSql = (): string =>
  [
    VOCABULARY_SQL,
    THEMES_SQL,
    PHRASES_SQL,
    STUDIOS_SQL,
    PEOPLE_SQL,
    STAFF_SQL,
    STUDIO_PEOPLE_SQL,
    OFFERINGS_SQL,
    SUBSCRIPTIONS_SQL,
    PASSES_SQL,
    NOTICES_SQL,
    PROGRAMS_SQL,
    COURSE_OFFERINGS_SQL,
    COURSES_SQL,
    TEMPLATES_SQL,
    COURSE_TEMPLATES_SQL,
    SESSIONS_SQL,
    CANCELLATION_SQL,
    BOOKINGS_SQL,
    CHECK_INS_SQL,
    WALK_IN_SQL,
    TODAY_CLASS_SQL, // after the check-ins, so it has none
    ATTENDANCE_SQL,
    MEMBER_DIARY_SQL,
    ENROLMENTS_SQL,
    AUTOMATIONS_SQL,
    CONNECTIONS_SQL,
    GUARDIANSHIPS_SQL,
  ].join('\n');

export const CAST = {
  lumen: { studio: LUMEN, owner: 'maren@lumen.studio', desk: 'ines@lumen.studio', instructor: 'tobias@lumen.studio', member: 'ava.klein@example.com' },
  northrock: { studio: NORTHROCK, owner: 'dario@northrock.gym', manager: 'kaya@northrock.gym', member: 'omar.haddad@example.com' },
} as const;
