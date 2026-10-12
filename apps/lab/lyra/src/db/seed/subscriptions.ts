import { day, insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

export const SUBSCRIPTIONS_SQL = insert(
  'subscriptions',
  ['id', 'studio_id', 'person_id', 'offering_id', 'status', 'started_on', 'ends_on', 'price_cents'],
  [
    // A grandfathered rate: €99 on a plan that sells for €119, so a forecast
    // reading the price list overstates her by €20 a month.
    ['sub_ava', LUMEN, 'p_ava', 'pl_lumen_unlimited', 'active', day(-420, LUMEN), null, 9900],
    ['sub_jonas', LUMEN, 'p_jonas', 'pl_lumen_eight', 'active', day(-180, LUMEN), null, null],
    ['sub_lena', LUMEN, 'p_lena', 'pl_lumen_eight', 'active', day(-9, LUMEN), null, null],
    ['sub_mira', LUMEN, 'p_mira', 'pl_lumen_unlimited', 'paused', day(-300, LUMEN), null, null],
    ['sub_sofia', LUMEN, 'p_sofia', 'pl_lumen_year', 'active', day(-75, LUMEN), null, null],
    ['sub_tobias', LUMEN, 'p_tobias', 'pl_lumen_unlimited', 'active', day(-500, LUMEN), null, null],
    ['sub_omar', NORTHROCK, 'p_omar', 'pl_nr_unlimited', 'active', day(-800, NORTHROCK), null, null],
    ['sub_nina', NORTHROCK, 'p_nina', 'pl_nr_unlimited', 'active', day(-210, NORTHROCK), null, null],
    ['sub_ruben', NORTHROCK, 'p_ruben', 'pl_nr_twice', 'active', day(-95, NORTHROCK), null, null],
    ['sub_kaya', NORTHROCK, 'p_kaya', 'pl_nr_unlimited', 'active', day(-900, NORTHROCK), null, null],
    ['sub_luca', NORTHROCK, 'p_luca', 'pl_nr_unlimited', 'cancelled', day(-700, NORTHROCK), null, null],
  ],
);
