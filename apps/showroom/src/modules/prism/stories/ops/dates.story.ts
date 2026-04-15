import * as demo from './dates.demo';
import source from './dates.demo?raw';

export const story = {
  id: 'dates',
  name: 'Date ops',
  description: '`$date` formats a date via a dayjs format string; `$dateAdd` shifts a date by an amount and unit; `$dateDiff` returns the difference between two dates in the requested unit.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
