import { insert } from '../sql';
import { GERMAN } from '../phrases.de';

export const PHRASES_SQL = insert(
  'phrases',
  ['locale', 'source', 'text'],
  Object.entries(GERMAN).map(([source, text]) => ['de', source, text]),
);
