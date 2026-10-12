import { day, insert } from '../sql';
import { LUMEN } from './studios';

export const PASSES_SQL = insert(
  'passes',
  ['id', 'studio_id', 'person_id', 'offering_id', 'credits_total', 'paid_via', 'purchased_on'],
  [['pass_ida', LUMEN, 'p_ida', 'of_lumen_dropin', 1, 'manual', day(-4, LUMEN)]],
);
