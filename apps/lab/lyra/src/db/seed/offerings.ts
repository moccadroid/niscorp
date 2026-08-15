// The price list both studios sell from.
import { insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

// The terms are deliberately UNEVEN: a seed where every plan is rolling with no
// notice makes a forecast that ignores both look correct. The pass rows are
// what the old model could not say at all — €18, one class, not a member.
export const OFFERINGS_SQL = insert(
  'offerings',
  ['id', 'studio_id', 'name', 'kind', 'price_cents', 'currency', 'interval', 'interval_count', 'class_allowance', 'active', 'minimum_term_months', 'notice_days', 'credits', 'valid_days'],
  [
    // Rolling, a month's notice — the commonest shape.
    ['pl_lumen_unlimited', LUMEN, 'Unlimited', 'recurring', 11900, 'EUR', 'month', 1, null, true, 0, 30, null, null],
    // Cancel any time: the plan a studio sells to hesitant people.
    ['pl_lumen_eight', LUMEN, 'Eight a month', 'recurring', 8900, 'EUR', 'month', 1, 8, true, 0, 0, null, null],
    // Twelve months up front, so its monthly value is a twelfth of the price.
    ['pl_lumen_year', LUMEN, 'Unlimited, yearly', 'recurring', 119000, 'EUR', 'year', 1, null, true, 12, 0, null, null],
    // Six-month commitment, two months' notice — the gym-contract shape.
    ['pl_nr_unlimited', NORTHROCK, 'Full mat', 'recurring', 13500, 'EUR', 'month', 1, null, true, 6, 60, null, null],
    ['pl_nr_twice', NORTHROCK, 'Twice a week', 'recurring', 9500, 'EUR', 'month', 1, 8, true, 3, 30, null, null],
    // QUARTERLY, and seeded rather than only tested: every revenue figure in
    // this app sums monthly_cents across plans, so a period that is not one
    // month has to be in the dataset those figures are read from. A studio
    // billing every three months is ordinary in AT and DE, and until the
    // interval became a pair it could not be written down at all.
    ['pl_nr_quarter', NORTHROCK, 'Full mat, quarterly', 'recurring', 36000, 'EUR', 'month', 3, null, true, 0, 30, null, null],

    // A drop-in IS a pass with one credit — no third kind, no special case.
    ['of_lumen_dropin', LUMEN, 'Single class', 'pass', 1800, 'EUR', 'month', 1, null, true, 0, 0, 1, null],
    ['of_lumen_ten', LUMEN, 'Ten classes', 'pass', 15500, 'EUR', 'month', 1, null, true, 0, 0, 10, 180],
    ['of_nr_dropin', NORTHROCK, 'Open mat drop-in', 'pass', 1500, 'EUR', 'month', 1, null, true, 0, 0, 1, null],

    // SOLD ONCE, GRANTS NOTHING — the shape that had no home at all. A joining
    // fee is not a class and not a membership, and recording it as a one-credit
    // pass would have handed everybody who paid it a free session.
    ['of_nr_joining', NORTHROCK, 'Joining fee', 'one_off', 3000, 'EUR', 'month', 1, null, true, 0, 0, null, null],
  ],
);
