// The automations each studio runs, one per moment.
import { insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

export const AUTOMATIONS_SQL = insert(
  'automations',
  ['id', 'studio_id', 'moment', 'effect', 'run_at', 'days', 'subject', 'body'],
  // FIVE ROWS, ONE PER MOMENT, and every one of them is checked end to end in
  // `tide-check`: fired against this data, and asserted on who it reached and
  // what it said. There were seven, and one of them — `au_rock_trial`, on
  // `trial.ended` — selected nobody on any day of this dataset, so it had
  // never sent anything and nothing would have noticed.
  [
    // WATCHED. Fires within a minute of somebody signing, which is the whole
    // reason "somebody joins" is worth automating rather than reading off a
    // list — and, since overlap no longer governs distinct events, it greets
    // all three people who join during an intro night rather than the first.
    ['au_lumen_welcome', LUMEN, 'member.joined', 'email', '09:00', 7, 'Welcome to Lumen', 'We are glad you are here. Come a few minutes early to your first class and somebody will show you around.'],
    // WATCHED. The other minute that decays: somebody asked, and is waiting.
    ['au_lumen_enquiry', LUMEN, 'enquiry.recorded', 'email', '09:00', 7, 'Thanks for getting in touch', 'Thanks for asking about training with us. Come in any time this week and try a class — no charge, no commitment.'],
    // SCHEDULED, with a window: the trial conversation before it closes rather
    // than after somebody notices it did.
    // Three days, not seven, and the number is load-bearing for the check: the
    // seeded trial has four days left, so this selects NOBODY today and Lena
    // once the window opens. A window that cannot be observed closing is a
    // number nobody has tested.
    ['au_lumen_trial', LUMEN, 'trial.ending', 'email', '09:00', 3, 'Your trial is nearly up', 'We would love to keep you on the mat — come and talk to us about a plan.'],
    // SCHEDULED, the money one. Still paying, stopped coming.
    ['au_lumen_quiet', LUMEN, 'member.quiet', 'email', '08:00', 7, 'We have missed you', 'It has been a while. Nothing has changed and your place is still here.'],
    // SCHEDULED, and the fan-out shape: one message per BOOKING, so forty
    // reminders retry independently rather than as one batch that half-fails.
    ['au_lumen_remind', LUMEN, 'class.tomorrow', 'email', '18:00', 7, 'See you tomorrow', 'You are booked in.'],

    // North Rock runs its own, differently worded — two studios, one
    // deployment, and neither can see the other's ledger.
    //
    // The welcome is here ON PURPOSE and not as decoration: both studios now
    // poll the same table with the same question, which is the arrangement
    // that used to have a competitor's automation email your member. The
    // check asserts it does not.
    ['au_rock_welcome', NORTHROCK, 'member.joined', 'email', '09:00', 7, 'Welcome to North Rock', 'First week matters more than the next ten. Come early and somebody will pair you up.'],
    ['au_rock_class', NORTHROCK, 'class.tomorrow', 'email', '17:00', 7, 'Training tomorrow', 'See you on the mat.'],
  ],
);
