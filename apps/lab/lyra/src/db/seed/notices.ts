import { day, insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

// Notice is seeded as a row, not as the column: the ledger derives
// `subscriptions.notice_given_on`, and the terms trigger derives the leaving
// date from that.
export const NOTICES_SQL = insert(
  'subscription_notices',
  ['studio_id', 'subscription_id', 'given_on'],
  [
    [LUMEN, 'sub_tobias', day(-7, LUMEN)],
    [NORTHROCK, 'sub_luca', day(-150, NORTHROCK)],
  ],
);
