import * as demo from './harvest.demo';
import source from './harvest.demo?raw';

export const story = {
  id: 'i18n-harvest',
  name: 'Harvest',
  description:
    'Keying on English only works if the strings can be enumerated mechanically — otherwise the second language is permanently 90% done. `harvestDefinition` walks the authored artifact (both conditional branches, the title, data defaults, words a trigger writes) without running it, and `missingFrom` subtracts the book to give you a release gate. Below it, `onPhraseMiss` answers the same question at runtime.',
  category: 'i18n',
  kind: 'i18n' as const,
  ...demo,
  source,
};
