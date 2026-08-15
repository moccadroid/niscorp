import { useState } from 'react';
import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';
import { GERMAN } from './books';
import { Aside, LANGUAGE_KIT, LocaleBar } from './kit';

// "12 OF 20" CANNOT BE A DICTIONARY ROW.
//
// Two numbers make its cardinality unbounded — no book will ever hold every
// sentence. What a book CAN hold is the PATTERN. `{ phrase: '{n} of {total}',
// slots: { n: 12, total: 20 } }` reaches the renderer as a STRUCTURE, the
// pattern string is translated whole like any other row, and the holes close
// afterwards. Cardinality stays out of the book.
//
// Translating whole is the point: word ORDER moves between languages, and a
// per-word table ("of" → "von") is a mapping that starts with two entries and
// never stops growing. Watch `{n} left` → `noch {n}` — the hole changes sides.
//
// A STRING SLOT IS VOCABULARY IN ITS OWN RIGHT. `somebody joins` is offered to
// the book before it is interpolated, so a composed sentence and its fragments
// are three separate rows that each translate.
//
// AND IT FILLS IN THE SOURCE LANGUAGE TOO. Switch to English: there is no book,
// nothing is translated — but the holes still close, because a component must
// never be handed a `{ phrase, slots }` object to draw. That job used to belong
// to a helper in the host's component kit; it belongs to the renderer.

const figures: ActionDefinition = {
  id: 'figures',
  data: {
    booked: { phrase: '{n} of {total}', slots: { n: 12, total: 20 } },
    credits: { phrase: '{n} left', slots: { n: 3 } },
    recipe: { phrase: 'When {moment}, {effect}', slots: { moment: 'somebody joins', effect: 'email them' } },
  },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 14 },
    children: [
      {
        component: 'Stack',
        props: { direction: 'row', gap: 12, wrap: true },
        children: [
          { component: 'Stat', props: { label: 'Standing', value: '60%', caption: '$.booked' } },
          { component: 'Stat', props: { label: 'Plan', value: '3', caption: '$.credits' } },
        ],
      },
      { component: 'Card', props: { title: 'Front desk', caption: '$.recipe' } },
    ],
  },
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'figures' }],
  actions: { figures },
  components: LANGUAGE_KIT,
  phrases: GERMAN,
});

export { shell };

export const Demo = () => {
  const [at, setAt] = useState('de');
  return (
    <div style={{ padding: 20, maxWidth: 620 }}>
      <LocaleBar shell={shell} at={at} onPick={setAt} />
      <Nova.Shell shell={shell} />
      <Aside>
        <code>{'{n} of {total}'}</code> is one dictionary row, not twenty. In <em>noch 3</em> the hole
        has moved to the other side of the word — which is why a pattern is translated whole rather
        than assembled from parts. The recipe line is three rows composing: the frame, plus
        <code> somebody joins</code> and <code>email them</code> as vocabulary of their own. Switch to
        English: nothing is translated, and the holes still close.
      </Aside>
    </div>
  );
};
