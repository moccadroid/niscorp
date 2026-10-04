import { DEFAULT_PHRASE_KEYS } from '../i18n';
import type { NovaExample } from './example.types';

// Words in the reader's language. The layouts are written in English, and the
// book is keyed on that English.
export const I18N_EXAMPLES: readonly NovaExample[] = [
  {
    id: 'i18n-switch',
    group: 'i18n',
    title: 'Switch',
    description: 'A screen that is already open changes language when its host hands the shell another book. Nova swaps the words as it draws: what a person wrote in the layout, and what stands at a prose key such as `placeholder`. What came from data stays as it is.',
    stage: false,
    action: {
      id: 'i18n-switch',
      data: { show: 'The Tempest' },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: 'Tonight' },
          { component: 'Text', children: '$.show' },
          { component: 'Input', ref: 'name', props: { placeholder: 'Your name' } },
          { component: 'Button', ref: 'book', children: 'Book a seat' },
        ],
      },
    },
    presses: [{ phrases: { Tonight: 'Heute Abend', 'Your name': 'Ihr Name', 'Book a seat': 'Platz buchen' } }],
    expected: { says: ['Heute Abend', 'The Tempest', 'Ihr Name', 'Platz buchen'], data: { show: 'The Tempest' } },
  },
  {
    id: 'i18n-keys',
    group: 'i18n',
    title: 'Authored and bound',
    description: 'A product called Pass, and a member whose surname is Pass. The book says what a Pass is in German, and only one of the two is renamed: a text a person wrote into the layout is prose, a text that came from data is not.',
    stage: false,
    phrases: { Pass: 'Zehnerblock' },
    action: {
      id: 'i18n-keys',
      data: { member: { surname: 'Pass' } },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: 'Pass' },
          { component: 'Text', children: '$.member.surname' },
        ],
      },
    },
    presses: [],
    expected: { says: ['Zehnerblock', 'Pass'], data: { member: { surname: 'Pass' } } },
  },
  {
    id: 'i18n-patterns',
    group: 'i18n',
    title: 'Counted phrases',
    description: 'No book can hold “4 left”: the number makes the rows endless. The row is the pattern, `{n} left`. It is translated whole, so the words may change places, and then its holes are closed. They close in the source language too, so a component is never handed the pattern itself.',
    stage: false,
    phrases: { '{n} left': 'noch {n}', '{n} of {total}': '{n} von {total}' },
    action: {
      id: 'i18n-patterns',
      data: { left: 4, sold: 16, seats: 20 },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Badge', props: { label: { phrase: '{n} left', slots: { n: '$.left' } } } },
          { component: 'Badge', props: { label: { phrase: '{n} of {total}', slots: { n: '$.sold', total: '$.seats' } } } },
        ],
      },
    },
    presses: [],
    expected: { says: ['noch 4', '16 von 20'], data: { left: 4, sold: 16, seats: 20 } },
  },
  {
    id: 'i18n-depth',
    group: 'i18n',
    title: 'Depth and display fields',
    description: 'Prose is found at any depth: a column’s `label` two levels down in a table’s spec is the same rule as a bare `label`. And a data field can be marked as words by its name: here every field ending in `_display` is prose, so the status a query made up is translated while `person_name` beside it is never touched, though “Pass” is in the book.',
    stage: false,
    phrases: { Member: 'Mitglied', Ticket: 'Karte', Standing: 'Stehplatz', Pass: 'Zehnerblock' },
    phraseKeys: { props: DEFAULT_PHRASE_KEYS.props, suffixes: ['_display'] },
    action: {
      id: 'i18n-depth',
      data: { rows: [{ person_name: 'Pass', ticket_display: 'Standing' }] },
      layout: {
        component: 'Table',
        props: {
          columns: [
            { key: 'person_name', label: 'Member' },
            { key: 'ticket_display', label: 'Ticket' },
          ],
          rows: '$.rows',
        },
      },
    },
    presses: [],
    expected: { says: ['Mitglied', 'Karte', 'Stehplatz'], data: { rows: [{ person_name: 'Pass', ticket_display: 'Standing' }] } },
  },
  {
    id: 'i18n-formatting',
    group: 'i18n',
    title: 'Formatting',
    description: 'No book can hold a price or a date either. Those are written for a region where they are made, by Prism, with the region named. Words go by language and formatting by region: the same amount in the same currency is written three ways across three countries that share a language.',
    stage: false,
    action: {
      id: 'i18n-formatting',
      data: { price_cents: 8900 },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Badge', props: { label: { $prism: { $localeMoney: { value: { $ref: '$.price_cents' }, currency: 'EUR', locale: 'de-AT' } } } } },
          { component: 'Badge', props: { label: { $prism: { $localeMoney: { value: { $ref: '$.price_cents' }, currency: 'EUR', locale: 'de-DE' } } } } },
          { component: 'Badge', props: { label: { $prism: { $localeMoney: { value: { $ref: '$.price_cents' }, currency: 'EUR', locale: 'de-CH' } } } } },
        ],
      },
    },
    presses: [],
    expected: { says: ['€\u00a089,00', '89,00\u00a0€', 'EUR\u00a089.00'], data: { price_cents: 8900 } },
  },
];
