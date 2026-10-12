import { insert } from '../sql';

export const LUMEN = 'st_lumen';
export const NORTHROCK = 'st_northrock';

// Two studios in Vienna reading different languages on purpose: anything that
// leaks between them is visible.
export const STUDIOS_SQL = insert(
  'studios',
  ['id', 'name', 'slug', 'kind', 'timezone', 'locale', 'theme_id', 'reply_to'],
  [
    [LUMEN, 'Lumen Yoga', 'lumen', 'yoga', 'Europe/Vienna', 'de', 'th_sand', 'hallo@lumenyoga.at'],
    [NORTHROCK, 'North Rock BJJ', 'northrock', 'bjj', 'Europe/Vienna', 'en', 'th_charcoal', 'hello@northrockbjj.at'],
  ],
);
