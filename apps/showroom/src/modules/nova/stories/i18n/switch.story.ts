import * as demo from './switch.demo';
import source from './switch.demo?raw';

export const story = {
  id: 'i18n-switch',
  name: 'Phrasebook',
  description:
    'The layout is readable English; the book is keyed on that English. Nova swaps the words in its renderer, so this needs no server and no adapter code — `createShell({ phrases })` is the whole wiring. Switch the language: `title`, `caption`, `label`, `placeholder` and the bare text child move; `variant` does not. `setPhrases` reaches the instance already mounted.',
  category: 'i18n',
  kind: 'i18n' as const,
  ...demo,
  source,
};
