// THE DATABASE, IN DEPENDENCY ORDER.
//
// One statement reaches Postgres — server/runtime.ts applies DDL as a single
// exec — and it is composed here from one fragment per subject. The array
// below IS the dependency graph: a fragment may name anything above it and
// nothing below, so the order is a fact somebody can read rather than one
// inferred from where a table happens to sit in a long file.
//
// A fragment owns its tables outright: their columns, their triggers, and
// their indexes. That is the rule that keeps this list the only place order
// lives — a trigger names a real table, so it is created where that table is,
// and an index is created where the table it reads is.
//
// plpgsql function BODIES are the one exemption, and a deliberate one: they
// are not validated at creation, so a function may name a table a later
// fragment creates. resync_relationships (people.ts) counts subscriptions,
// passes and enrolments before any of them exist; spend_pass_credit
// (passes.ts) reads a check-in row from a table two fragments further down.
// A `LANGUAGE sql` function has no such licence — studio_today is validated
// against studios the moment it is created, which is why it sits beside it.
import { THEMES_DDL } from './themes';
import { PHRASES_DDL } from './phrases';
import { STUDIOS_DDL } from './studios';
import { PEOPLE_DDL } from './people';
import { OFFERINGS_DDL } from './offerings';
import { SUBSCRIPTIONS_DDL } from './subscriptions';
import { NOTICES_DDL } from './notices';
import { PAUSES_DDL } from './pauses';
import { PASSES_DDL } from './passes';
import { PURCHASES_DDL } from './purchases';
import { INTEGRATIONS_DDL } from './integrations';
import { PROGRAMS_DDL } from './programs';
import { CLASSES_DDL } from './classes';
import { BOOKINGS_DDL } from './bookings';
import { ENROLMENTS_DDL } from './enrolments';
import { AUTOMATIONS_DDL } from './automations';
import { NOTIFICATIONS_DDL } from './notifications';
import { MAIL_DDL } from './mail';

export const DDL = [
  THEMES_DDL, //         the look
  PHRASES_DDL, //        the words
  STUDIOS_DDL, //        the tenant, and the clock every date is stamped from
  PEOPLE_DDL, //         humans, the anchor, staff, connections
  OFFERINGS_DDL, //      what a studio sells
  SUBSCRIPTIONS_DDL, //  what a person holds
  NOTICES_DDL, //        giving notice on one
  PAUSES_DDL, //         freezing one
  PASSES_DDL, //         class credits
  PURCHASES_DDL, //      things bought once, that grant nothing
  INTEGRATIONS_DDL, //   which integrations a studio has bought
  PROGRAMS_DDL, //       programs and courses
  CLASSES_DDL, //        the timetable
  BOOKINGS_DDL, //       seats and check-ins
  ENROLMENTS_DDL, //     joining a course
  AUTOMATIONS_DDL, //    the vocabulary, and the automations built from it
  NOTIFICATIONS_DDL, //  the studio being told things
  MAIL_DDL, //           what goes out, and who must not be written to
].join('\n');
