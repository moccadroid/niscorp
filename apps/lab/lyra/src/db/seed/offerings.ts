import { insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

// The terms are deliberately uneven: a seed where every plan is rolling with no
// notice makes a forecast that ignores both look correct.
export const OFFERINGS_SQL = insert(
  'offerings',
  ['id', 'studio_id', 'name', 'kind', 'price_cents', 'currency', 'interval', 'interval_count', 'class_allowance', 'active', 'minimum_term_months', 'notice_days', 'credits', 'valid_days', 'joining_fee_id'],
  [
    ['pl_lumen_unlimited', LUMEN, 'Unlimited', 'recurring', 11900, 'EUR', 'month', 1, null, true, 0, 30, null, null, 'of_lumen_joining'],
    ['pl_lumen_eight', LUMEN, 'Eight a month', 'recurring', 8900, 'EUR', 'month', 1, 8, true, 0, 0, null, null, null],
    ['pl_lumen_year', LUMEN, 'Unlimited, yearly', 'recurring', 119000, 'EUR', 'year', 1, null, true, 12, 0, null, null, null],
    ['pl_nr_unlimited', NORTHROCK, 'Full mat', 'recurring', 13500, 'EUR', 'month', 1, null, true, 6, 60, null, null, 'of_nr_joining'],
    ['pl_nr_twice', NORTHROCK, 'Twice a week', 'recurring', 9500, 'EUR', 'month', 1, 8, true, 3, 30, null, null, null],
    ['pl_nr_quarter', NORTHROCK, 'Full mat, quarterly', 'recurring', 36000, 'EUR', 'month', 3, null, true, 0, 30, null, null, null],

    ['of_lumen_dropin', LUMEN, 'Single class', 'pass', 1800, 'EUR', 'month', 1, null, true, 0, 0, 1, null, null],
    ['of_lumen_ten', LUMEN, 'Ten classes', 'pass', 15500, 'EUR', 'month', 1, null, true, 0, 0, 10, 180, null],
    ['of_nr_dropin', NORTHROCK, 'Open mat drop-in', 'pass', 1500, 'EUR', 'month', 1, null, true, 0, 0, 1, null, null],

    ['of_nr_joining', NORTHROCK, 'Joining fee', 'one_off', 3000, 'EUR', 'month', 1, null, true, 0, 0, null, null, null],
    ['of_lumen_joining', LUMEN, 'Joining fee', 'one_off', 5000, 'EUR', 'month', 1, null, true, 0, 0, null, null, null],
  ],
);
