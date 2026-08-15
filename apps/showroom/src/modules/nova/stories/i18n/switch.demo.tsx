import { useState } from 'react';
import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';
import { GERMAN } from './books';
import { Aside, LANGUAGE_KIT, LocaleBar } from './kit';

// A LAYOUT IN READABLE ENGLISH, AND A BOOK BESIDE IT.
//
// There is no `t('desk.add')` here, no key per string, no import of a
// translation helper. The layout says what it draws. The book is keyed on the
// English itself, which is what buys that back.
//
// Nova swaps the words in its RENDERER, where a RenderNode is minted — so this
// works with no server, no moss, and no adapter code. Switch the language and
// watch which strings move: `title`, `label`, `placeholder` and a bare text
// child are prose. `variant` is not.

const desk: ActionDefinition = {
  id: 'desk',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 14 },
    children: [
      {
        component: 'Card',
        props: { title: 'Front desk', caption: 'Everyone the studio deals with.' },
        children: {
          component: 'Stack',
          props: { direction: 'column', gap: 10 },
          children: [
            { component: 'Input', props: { placeholder: 'Search people' } },
            {
              component: 'Stack',
              props: { direction: 'row', gap: 8 },
              children: [
                { component: 'Button', props: { label: 'Add a member', variant: 'primary' }, ref: 'add' },
                { component: 'Button', props: { variant: 'secondary' }, ref: 'cancel', children: 'Cancel' },
              ],
            },
          ],
        },
      },
    ],
  },
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'desk' }],
  actions: { desk },
  components: LANGUAGE_KIT,
  // The book this shell was BORN with. `phraseKeys` is omitted, so nova's
  // default prose props apply — `title`, `caption`, `label`, `placeholder` are
  // all in that set already.
  phrases: GERMAN,
});

export { shell };

export const Demo = () => {
  const [at, setAt] = useState('de');
  return (
    <div style={{ padding: 20, maxWidth: 560 }}>
      <LocaleBar shell={shell} at={at} onPick={setAt} />
      <Nova.Shell shell={shell} />
      <Aside>
        The switch calls <code>shell.setPhrases(book)</code>. Nothing remounts — the action instance on
        screen was spawned in one language and renders in another, because a runtime asks for the book
        at every render instead of holding one from spawn. “English” passes <code>undefined</code>: the
        source language has no book, by construction.
      </Aside>
    </div>
  );
};
