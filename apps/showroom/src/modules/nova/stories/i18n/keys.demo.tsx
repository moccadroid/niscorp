import { useState } from 'react';
import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';
import { GERMAN } from './books';
import { Aside, LANGUAGE_KIT, LocaleBar } from './kit';

// THE GUARD RAIL, ON PURPOSE.
//
// Keying a dictionary on English has one obvious way to go wrong: a member
// called Pass, the day the studio starts selling one. "Pass" → "Zehnerblock" is
// a real row in the book. Switch to Deutsch and watch which of the two moves.
//
// TWO RULES DO THE WORK, and both are the renderer's:
//
//  1. PROSENESS IS DECIDED BY THE KEY. `title` is prose, `name` is not — and no
//     value ever votes on the question. The book is not even consulted for
//     `name`, so it does not matter what is in it.
//
//  2. A BOUND TEXT CHILD IS DATA. A text position has no key to protect it, so
//     the renderer uses what only the renderer knows: whether the string was
//     authored or resolved. `children: '$.member.surname'` is left alone;
//     `children: 'Pass'` written by hand is translated. Once a tree exists both
//     are the same plain string and the difference is unrecoverable — which is
//     exactly why this rule cannot live in a pass over the finished tree.

const roster: ActionDefinition = {
  id: 'roster',
  data: {
    member: { surname: 'Pass', plan: 'Pass' },
  },
  layout: {
    component: 'Stack',
    props: { direction: 'row', gap: 14, wrap: true },
    children: [
      // A PERSON. Their surname happens to be a word in the book.
      {
        component: 'Card',
        // `name` is not a prose key, so this is safe even though it is bound.
        props: { title: 'Person', name: '$.member.surname' },
        // ...and a bound TEXT child is data too — same string, same protection.
        children: { component: 'Text', props: { size: 'sm', color: '#6b7280' }, children: '$.member.surname' },
      },
      // A PRODUCT. The same six letters, authored by a person, at a prose key.
      {
        component: 'Card',
        props: { title: 'Plan', caption: 'Pass' },
        children: { component: 'Text', props: { size: 'sm', color: '#6b7280' }, children: 'Pass' },
      },
    ],
  },
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'roster' }],
  actions: { roster },
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
        <strong>“Pass” → “Zehnerblock” is in the book.</strong> The left card holds a member whose
        surname is Pass and never changes — once at <code>name</code> (not a prose key) and once as a
        bound text child (data, not authored). The right card holds the product and translates, at
        <code> caption</code> and as a hand-written text child. Four identical strings; two move.
      </Aside>
    </div>
  );
};
