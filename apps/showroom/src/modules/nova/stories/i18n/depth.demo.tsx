import { useState } from 'react';
import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';
import { DEFAULT_PHRASE_KEYS } from '@niscorp/nova/i18n';
import { GERMAN } from './books';
import { Aside, LANGUAGE_KIT, LocaleBar } from './kit';

// WHERE THE WORDS ON A REAL SCREEN ACTUALLY LIVE.
//
// Almost nothing on a table is a top-level string prop. The column headers are
// two levels down inside a SPEC — `columns: [{ label }]` — and the words in the
// cells never came from a layout at all; a query manufactured them.
//
// Two rules cover both, and neither needs anything listed by hand:
//
//  1. MATCHING IS AT ANY DEPTH inside a prop value. A prop that is an array of
//     objects is walked, and proseness is re-decided per key on the way down.
//     `columns[0].label` is prose; `columns[0].key` is not.
//
//  2. A SUFFIX RULE names a convention instead of forty fields. Declare
//     `_display` once and every closed-set word a read invents becomes
//     translatable — while `person_name` two columns over stays untouchable,
//     because it does not end in `_display`.
//
// An array of BARE strings inherits its key's proseness — so `['Yes','No']`
// translates without anyone wrapping the words in objects, PROVIDED the outer
// key is prose. `options` is not in nova's default set (the default covers the
// `label` inside `options: [{ label }]`), so this demo names it.

const roll: ActionDefinition = {
  id: 'roll',
  data: {
    // Pretend this arrived from a query. `status_display` is a word the read
    // manufactured; `person_name` is somebody's name. Both are row data.
    rows: [
      { id: '1', person_name: 'Ava Klein', status_display: 'Active', plan_display: 'Pass' },
      { id: '2', person_name: 'Tobias Reiner', status_display: 'Trialling', plan_display: 'Pass' },
      { id: '3', person_name: 'Mira Sandoval', status_display: 'Paused', plan_display: 'Pass' },
    ],
  },
  layout: {
    component: 'Card',
    props: { title: 'Front desk' },
    children: {
      component: 'Stack',
      props: { direction: 'column', gap: 12 },
      children: [
        {
          component: 'Table',
          props: {
            rows: '$.rows',
            empty: 'Nobody here yet.',
            columns: [
              { label: 'Person', key: 'person_name' },
              { label: 'Standing', key: 'status_display' },
              { label: 'Plan', key: 'plan_display' },
            ],
          },
        },
        { component: 'Chips', props: { options: ['Yes', 'No'] } },
      ],
    },
  },
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'roll' }],
  actions: { roll },
  components: LANGUAGE_KIT,
  phrases: GERMAN,
  // THE APP'S OWN CONVENTION, declared once.
  //
  // `props` REPLACES nova's default set, so spread it — this is the mistake
  // worth making here rather than in your app. `options` has to be named: the
  // default set covers the `label` INSIDE `options: [{ label }]`, which is the
  // usual shape, but a bare `['Yes','No']` has no inner key to be prose, so the
  // outer one must be.
  //
  // `suffixes` is the half that reaches words a query made, and it is a
  // CONVENTION rather than a list — every future `*_display` field is covered
  // the day somebody writes it.
  phraseKeys: { props: [...DEFAULT_PHRASE_KEYS.props, 'options'], suffixes: ['_display'] },
});

export { shell };

export const Demo = () => {
  const [at, setAt] = useState('de');
  return (
    <div style={{ padding: 20, maxWidth: 620 }}>
      <LocaleBar shell={shell} at={at} onPick={setAt} />
      <Nova.Shell shell={shell} />
      <Aside>
        Three column headers translate from two levels inside a spec prop. The <em>Standing</em> and
        <em> Plan</em> cells translate because their fields end in <code>_display</code> — one rule, not
        forty field names. The <em>Person</em> cells never move: <code>person_name</code> matches no
        prose key, and “Pass” is in the book. The chips are a bare string array: it inherits its
        key’s proseness, and <code>options</code> had to be named because nova’s default set covers
        the <code>label</code> inside <code>options: [{'{ label }'}]</code>, not the outer key.
      </Aside>
    </div>
  );
};
