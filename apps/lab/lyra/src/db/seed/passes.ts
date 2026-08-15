// The walk-in who bought a single class.
import { day, insert } from '../sql';
import { LUMEN } from './studios';

// Ida walked in off the street and bought a single class for Saturday — the
// backbone of a yoga studio's trade, and the person the old schema literally
// could not represent without lying about a membership.
export const PASSES_SQL = insert(
  'passes',
  ['id', 'studio_id', 'person_id', 'offering_id', 'credits_total', 'paid_via', 'purchased_on'],
  [['pass_ida', LUMEN, 'p_ida', 'of_lumen_dropin', 1, 'manual', day(-4, LUMEN)]],
);
