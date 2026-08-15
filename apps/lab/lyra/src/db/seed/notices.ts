// Notice given, as rows — the ledger the leaving dates derive from.
import { day, insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

// Tobias is leaving. The notice is a ROW now, not a column somebody set: the
// ledger derives `subscriptions.notice_given_on`, and the terms trigger derives
// the day he actually goes from that. Seeding the column directly would leave a
// leaving date nothing backed — and a withdrawal with nothing to withdraw.
// Luca's notice is history: given five months ago, run out, the subscription
// cancelled — which is what his "Left" standing derives from.
export const NOTICES_SQL = insert(
  'subscription_notices',
  ['studio_id', 'subscription_id', 'given_on'],
  [
    [LUMEN, 'sub_tobias', day(-7, LUMEN)],
    [NORTHROCK, 'sub_luca', day(-150, NORTHROCK)],
  ],
);
