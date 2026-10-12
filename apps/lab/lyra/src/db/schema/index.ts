// The `DDL` array is in dependency order: a fragment may name anything above it
// and nothing below. plpgsql function bodies are exempt, because they are not
// validated at creation; a `LANGUAGE sql` function is validated when created.
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
import { CAMPAIGNS_DDL } from './campaigns';
import { MAIL_DDL } from './mail';

export const DDL = [
  THEMES_DDL,
  PHRASES_DDL,
  STUDIOS_DDL,
  PEOPLE_DDL,
  OFFERINGS_DDL,
  SUBSCRIPTIONS_DDL,
  NOTICES_DDL,
  PAUSES_DDL,
  PASSES_DDL,
  PURCHASES_DDL,
  INTEGRATIONS_DDL,
  PROGRAMS_DDL,
  CLASSES_DDL,
  BOOKINGS_DDL,
  ENROLMENTS_DDL,
  AUTOMATIONS_DDL,
  NOTIFICATIONS_DDL,
  CAMPAIGNS_DDL,
  MAIL_DDL,
].join('\n');
