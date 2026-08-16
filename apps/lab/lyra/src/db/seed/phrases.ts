// The German phrase book, as rows.
import { insert } from '../sql';
import { GERMAN } from '../phrases.de';

// Keyed `de`, which is also what a studio stores: Vienna and Hamburg read the
// same sentences, and the app offers ONE German rather than three. What is not
// in here is money and dates — `Intl` derives those from the same tag.
export const PHRASES_SQL = insert(
  'phrases',
  ['locale', 'source', 'text'],
  Object.entries(GERMAN).map(([source, text]) => ['de', source, text]),
);
