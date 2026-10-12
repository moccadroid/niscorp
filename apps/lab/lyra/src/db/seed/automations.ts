import { insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

export const AUTOMATIONS_SQL = insert(
  'automations',
  ['id', 'studio_id', 'moment', 'effect', 'run_at', 'days', 'subject', 'body'],
  [
    ['au_lumen_welcome', LUMEN, 'member.joined', 'email', '09:00', 7, 'Welcome to Lumen', 'We are glad you are here. Come a few minutes early to your first class and somebody will show you around.'],
    ['au_lumen_enquiry', LUMEN, 'enquiry.recorded', 'email', '09:00', 7, 'Thanks for getting in touch', 'Thanks for asking about training with us. Come in any time this week and try a class — no charge, no commitment.'],
    // Three days is load-bearing for the check: the seeded trial has four days
    // left, so this selects nobody today and Lena once the window opens.
    ['au_lumen_trial', LUMEN, 'trial.ending', 'email', '09:00', 3, 'Your trial is nearly up', 'We would love to keep you on the mat — come and talk to us about a plan.'],
    ['au_lumen_quiet', LUMEN, 'member.quiet', 'email', '08:00', 7, 'We have missed you', 'It has been a while. Nothing has changed and your place is still here.'],
    ['au_lumen_remind', LUMEN, 'class.tomorrow', 'email', '18:00', 7, 'See you tomorrow', 'You are booked in.'],

    // North Rock's welcome is here on purpose: both studios poll the same table
    // with the same question, and the check asserts neither reaches the other's
    // member.
    ['au_rock_welcome', NORTHROCK, 'member.joined', 'email', '09:00', 7, 'Welcome to North Rock', 'First week matters more than the next ten. Come early and somebody will pair you up.'],
    ['au_rock_class', NORTHROCK, 'class.tomorrow', 'email', '17:00', 7, 'Training tomorrow', 'See you on the mat.'],
  ],
);
