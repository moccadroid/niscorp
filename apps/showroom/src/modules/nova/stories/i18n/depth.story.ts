import * as demo from './depth.demo';
import source from './depth.demo?raw';

export const story = {
  id: 'i18n-depth',
  name: 'Spec props',
  description:
    'Where words on a real screen actually live: column headers two levels down inside `columns: [{ label }]`, and cell words a query manufactured rather than a layout authored. Matching is at any depth with proseness re-decided per key, and a `_display` suffix names a convention instead of forty field names — while `person_name` beside it stays untouchable even though “Pass” is in the book.',
  category: 'i18n',
  kind: 'i18n' as const,
  ...demo,
  source,
};
