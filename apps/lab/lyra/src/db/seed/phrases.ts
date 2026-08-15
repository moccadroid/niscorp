// The German phrase book, as rows.
import { insert } from '../sql';
import { GERMAN } from '../phrases.de';

// Keyed `de`: Vienna and Hamburg read the same sentences. What differs is the
// money and the dates, and `Intl` derives that from the studio's full tag —
// so Lumen's `de-AT` gets these words and Austrian formatting from one row set.
export const PHRASES_SQL = insert(
  'phrases',
  ['locale', 'source', 'text'],
  Object.entries(GERMAN).map(([source, text]) => ['de', source, text]),
);
