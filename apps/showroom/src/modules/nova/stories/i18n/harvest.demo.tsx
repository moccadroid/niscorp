import { useMemo, useState } from 'react';
import { createShell, type ActionDefinition } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';
import { harvestDefinition, missingFrom } from '@niscorp/nova/i18n';
import { GERMAN } from './books';
import { Btn, Chip, Grid, INK, MONO, Mono, Panel } from '@showroom/chrome/stage/ui';
import { Device } from '../../stage/device';
import { Aside, LANGUAGE_KIT } from './kit';

// THE HALF NOBODY BUILDS, AND THE REASON KEYING ON ENGLISH WORKS AT ALL.
//
// Source strings as keys is only a good trade if there is a MECHANICAL way to
// enumerate them. Otherwise "translate the app" means a person reading every
// layout, and the second language is permanently 90% done.
//
// `harvestDefinition` walks the AUTHORED artifact — this action, right here —
// and returns every phrase it could ever put on a screen, with every site it
// was written at. It never runs the action and never looks at a rendered tree,
// which is the second half of the collision guard: only a string a person WROTE
// can enter the dictionary, so a member who happened to be on screen the day
// somebody ran the harvest cannot get in.
//
// `missingFrom` subtracts the book. That number is a release gate.
//
// Below it, the same question asked at RUNTIME: `onPhraseMiss` fires for every
// phrase the renderer looked up and did not find. A miss renders as the source
// language — never an empty box, never a raw key — so without a report it is
// silent. "Archive everything" is deliberately absent from the book.

const desk: ActionDefinition = {
  id: 'desk',
  title: 'Front desk',
  data: { note: 'Nobody here yet.' },
  layout: {
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
            { component: 'Button', props: { label: 'Add a member' }, ref: 'add' },
            // No entry in the book — on purpose.
            { component: 'Button', props: { label: 'Archive everything', variant: 'secondary' }, ref: 'archive' },
          ],
        },
        // A conditional's BOTH branches are harvested: the words in the branch
        // nobody is looking at are still words the app can say.
        { if: '$.empty', then: 'Nobody here yet.', else: { component: 'Chips', props: { options: ['Yes', 'No'] } } },
      ],
    },
  },
  // A trigger that WRITES words into data is harvested too — an error message
  // is as much product copy as a heading, and no layout walk would see it.
  triggers: [{ event: 'ui:click', ref: 'archive', do: [{ set: 'note', value: 'Could not archive.' }] }],
};

const misses: { phrase: string; where: string }[] = [];

const shell = createShell({
  canvases: [{ id: 'main', initial: 'desk' }],
  actions: { desk },
  components: LANGUAGE_KIT,
  phrases: GERMAN,
  onPhraseMiss: (phrase, where) => {
    if (!misses.some((m) => m.phrase === phrase)) misses.push({ phrase, where });
  },
});

export { shell };

export const Demo = () => {
  const [shown, setShown] = useState(false);
  const found = useMemo(() => harvestDefinition(desk), []);
  const absent = useMemo(() => missingFrom(found, GERMAN), [found]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%', maxWidth: 1080 }}>
      <Grid min={340} gap={20}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Device status="Acme Studio · Deutsch" minHeight={240}>
            <Nova.Shell shell={shell} />
          </Device>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Panel title="What this action can say" aside={`${found.length} phrases, read from the definition without running it`}>
            <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'hidden' }}>
              {found.map((entry) => {
                const has = GERMAN[entry.phrase] !== undefined;
                return (
                  <div
                    key={entry.phrase}
                    style={{ display: 'flex', gap: 10, padding: '7px 11px', borderTop: `1px solid ${INK.line}`, background: has ? '#fff' : INK.badWash, alignItems: 'baseline', fontFamily: MONO, fontSize: 12 }}
                  >
                    <span style={{ flex: '0 0 42%' }}>{entry.phrase}</span>
                    <span style={{ flex: '0 0 28%', color: has ? INK.ok : INK.bad }}>{has ? GERMAN[entry.phrase] : '— missing —'}</span>
                    <span style={{ color: INK.faint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.where.join('  ')}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip tone={absent.length === 0 ? 'ok' : 'bad'}>
                {found.length - absent.length}/{found.length} translated
              </Chip>
              <span style={{ fontSize: 12.5, color: INK.soft }}>
                <Mono>missingFrom()</Mono> reports {absent.length}
              </span>
            </div>
          </Panel>
          <Panel title="What did the render actually miss?" aside="onPhraseMiss, at runtime">
            <div>
              <Btn onClick={() => setShown((v) => !v)}>{shown ? 'Hide the misses' : 'Show the misses'}</Btn>
            </div>
            {shown &&
              (misses.length === 0 ? (
                <div style={{ fontSize: 12.5, color: INK.soft }}>Nothing missed yet.</div>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 12, color: INK.bad, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {misses.map((m) => (
                    <div key={m.phrase}>
                      {m.phrase} <span style={{ color: INK.faint }}>at {m.where}</span>
                    </div>
                  ))}
                </div>
              ))}
          </Panel>
        </div>
      </Grid>

      <Aside>
        Two ways of asking the same question. <code>harvestDefinition</code> reads the artifact — every
        branch of the conditional, the action title, the data defaults, and the words a trigger writes
        — so it is complete before anybody opens a screen. <code>onPhraseMiss</code> answers at
        runtime, for the words that only a real read produces. Note that “Archive everything” renders
        in English rather than as a key or an empty box: a miss shows the source language, which is the
        only sane failure and also the one that hides.
      </Aside>
    </div>
  );
};
