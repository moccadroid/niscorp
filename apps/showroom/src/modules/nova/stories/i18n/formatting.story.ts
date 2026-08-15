import * as demo from './formatting.demo';
import source from './formatting.demo?raw';

export const story = {
  id: 'i18n-formatting',
  name: 'Locale formatting',
  description:
    'No dictionary can hold “€ 89,00” or “14.03.2026” — unbounded cardinality — so money, dates and numbers are formatted at their source by prism’s `$localeMoney` / `$localeDate` / `$localeNumber`, delegating to `Intl`. The two halves split on different axes: one German book serves Vienna, Hamburg and Zürich, while the same currency in the same language is written three different ways across them. Switch the tag: the figures move on all four, the words only on the language.',
  category: 'i18n',
  kind: 'i18n' as const,
  ...demo,
  source,
};
