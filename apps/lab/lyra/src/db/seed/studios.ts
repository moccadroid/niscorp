// The two studios everything else in the seed hangs off.
import { insert } from '../sql';

export const LUMEN = 'st_lumen';
export const NORTHROCK = 'st_northrock';

// TWO STUDIOS IN VIENNA READING DIFFERENT LANGUAGES. Not a contrivance — it is
// the demo's whole point for i18n: one deployment, one set of actions, one set
// of rows, and two shells whose every word and every amount differ. Anything
// that leaks between them is a bug the seed makes visible.
// `reply_to` is the studio's OWN address, and it is seeded because a message
// that goes out with none is one a member cannot answer: mail leaves from the
// shared deployment domain wearing the studio's name, so the reply header is
// the only thing pointing home. An empty one is not a small gap — it is a
// reply landing at an address nobody reads.
export const STUDIOS_SQL = insert(
  'studios',
  ['id', 'name', 'slug', 'kind', 'timezone', 'locale', 'theme_id', 'reply_to'],
  [
    [LUMEN, 'Lumen Yoga', 'lumen', 'yoga', 'Europe/Vienna', 'de-AT', 'th_sand', 'hallo@lumenyoga.at'],
    [NORTHROCK, 'North Rock BJJ', 'northrock', 'bjj', 'Europe/Vienna', 'en-GB', 'th_charcoal', 'hello@northrockbjj.at'],
  ],
);
