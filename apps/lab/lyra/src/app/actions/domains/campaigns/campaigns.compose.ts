import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { AUDIENCES, campaignCreate } from '@lyra/app/vex/campaign.entries';

// ═══════════════════════════════════════════════════════════════
// WRITING TO EVERYBODY AT ONCE, WITH NOTHING TO SET UP FIRST.
//
// The competition needs a list import, a field mapping, a segment builder and
// a merge-tag setup before anybody can type a sentence, because it does not
// know who the customers are. This screen is a QUESTION ABOUT THE STUDIO'S OWN
// PEOPLE, three fields, and a button.
//
// A PAGE, NOT A SHEET. Writing to four hundred people is not a detail you
// glance at over another screen — it is the task, it wants the width a desk
// has, and a column of controls squeezed into an overlay is a phone layout
// wearing a monitor. The `Grid` below is what makes that responsive by
// construction rather than by a breakpoint somebody maintains: two columns
// where there is room, one where there is not.
//
// WHO GETS IT LIVES BEHIND A LINK. The count is always on screen; the names
// are one click away (`campaigns.recipients`). A list of four hundred people
// pinned open under a compose box is not information, it is furniture.
// ═══════════════════════════════════════════════════════════════

// BAKED INTO THE MANIFEST, not fetched. The audiences are app constants — the
// same for every studio, shipped with the release — so asking a function what
// they are is a round trip to be told what this file already imports. The
// same argument the automations form makes for its moments and effects.
const AUDIENCE_OPTIONS = AUDIENCES.map((audience) => ({ value: audience.id, label: audience.phrase, windowed: audience.windowed }));

const FIRST = AUDIENCE_OPTIONS[0];

const question = { audience: { $ref: '$.audience' }, cutoff: { $ref: '$.cutoff' } };
// THE QUESTION MINUS WHO WAS STRUCK OFF — and which of the two each read gets
// is the difference between two numbers that say something and two that always
// agree. The TOTAL is the question itself: striking somebody off does not make
// them stop being on the studio's roll. What moves is the number the button is
// about, which is why the exclusion rides that one and the write, and nothing
// else.
const minusStruckOff = { ...question, except: { $ref: '$.excluded' } };

const composeLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
      children: [
        { component: 'Hero', props: { title: 'Write to your people', lead: 'Pick who it goes to, say your piece, send.' } },
        { component: 'Button', props: { variant: 'ghost', label: 'Cancel' }, ref: 'cancel' },
      ],
    },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    {
      component: 'Grid',
      props: { min: 380, gap: 22 },
      children: [
        // ── what you are writing ─────────────────────────────
        {
          component: 'Stack',
          props: { gap: 16 },
          children: [
            {
              component: 'Select',
              props: { label: 'Who it goes to', options: '$.audienceOptions', hint: 'A question about your own people. Nothing to import.' },
              ref: 'audience',
              model: '$.audience',
            },
            // Only the knob this question takes. "Gone quiet" is meaningless
            // without "since when"; "everyone on trial" would be lied to by a
            // window.
            {
              if: '$.windowed',
              then: { component: 'Input', props: { label: 'Quiet for how many days', type: 'number' }, ref: 'days', model: '$.days' },
              else: '',
            },
            { component: 'Input', props: { label: 'Subject' }, ref: 'subject', model: '$.subject' },
            { component: 'Textarea', props: { label: 'Message', rows: 12 }, ref: 'body', model: '$.body' },
          ],
        },

        // ── who will hear it, and the button ─────────────────
        {
          component: 'Stack',
          props: { gap: 16 },
          children: [
            {
              component: 'Card',
              props: { pad: 18 },
              children: {
                component: 'Stack',
                props: { gap: 10 },
                children: [
                  // COUNTED PATTERNS, not sentences: each arrives as "{n} will
                  // be written to" plus its number, and `phrase` is what fills
                  // it — in the reader's own language, by the same pass every
                  // other sentence in the product goes through.
                  {
                    component: 'Stack',
                    props: { gap: 2 },
                    children: [
                      { component: 'Text', props: { size: 'xl', weight: 'semi', phrase: '$.writable.ok_display' } },
                      { component: 'Text', props: { size: 'sm', color: 'mute', phrase: '$.counted.total_display' } },
                    ],
                  },
                  { component: 'Button', props: { variant: 'ghost', label: 'See who gets it' }, ref: 'recipients' },
                ],
              },
            },
            { component: 'Text', props: { size: 'sm', color: 'faint', phrase: '$.today.used_display' } },
            { component: 'Button', props: { variant: 'solid', big: true, label: 'Send it', disabled: '$.saving' }, ref: 'send' },
          ],
        },
      ],
    },
  ],
};

const askAgain: Step[] = [{ call: 'counted' }, { call: 'writable' }];

// The window as a DATE, from the studio's own clock rather than a browser's —
// the same function the retention screen asks, for the same reason: a browser
// never says what today is.
const reWindow: Step = { call: 'window', onSuccess: [{ set: 'cutoff', value: '$.windowRow.from' }, ...askAgain] };

export const campaignComposeAction: ActionDefinition = {
  id: 'campaigns.compose',
  title: 'Write to your people',
  data: {
    audience: FIRST?.value ?? '',
    audienceOptions: AUDIENCE_OPTIONS,
    windowed: FIRST?.windowed ?? false,
    days: 30,
    audienceDays: 0,
    windowRow: {},
    cutoff: '',
    subject: '',
    body: '',
    counted: {},
    writable: {},
    today: {},
    // WHO IS STRUCK OFF, and it travels to the campaign row as it is. Owned
    // here rather than in the sheet that edits it: the sheet is a view, the
    // page is what sends.
    excluded: [],
    saving: false,
    error: '',
  },
  layout: composeLayout,
  endpoints: {
    window: { fn: 'reports.window', target: 'windowRow' },
    counted: { url: '/api/campaigns/vex', method: 'POST', request: { fingerprint: 'campaigns/audience-count', context: question }, target: 'counted', errorTarget: 'error' },
    writable: { url: '/api/campaigns/vex', method: 'POST', request: { fingerprint: 'campaigns/audience-writable', context: minusStruckOff }, target: 'writable', errorTarget: 'error' },
    today: { url: '/api/campaigns/vex', method: 'POST', request: { fingerprint: 'campaigns/sent-today', context: {} }, target: 'today' },
    // ONE ROW, AND IT IS NOT MAIL. What the studio decided to say; the
    // machinery reads it and writes the messages (reflexes/compose.ts).
    create: {
      url: '/api/campaigns/vex',
      method: 'POST',
      request: {
        fingerprint: campaignCreate.fingerprint,
        context: {
          audience: { $ref: '$.audience' },
          audienceDays: { $ref: '$.audienceDays' },
          excluded: { $ref: '$.excluded' },
          subject: { $ref: '$.subject' },
          body: { $ref: '$.body' },
        },
      },
      errorTarget: 'error',
    },
  },
  // The window first: every question is asked with a cutoff, and firing them
  // beside the call that resolves the date would send an empty string.
  lifecycle: { mount: [{ call: 'today' }, reWindow] },
  triggers: [
    {
      event: 'ui:model',
      ref: 'audience',
      // A `Select` DISPATCHES ITS VALUE, not the option object it came from
      // (ui/components/forms.tsx) — so whether this question takes a window is
      // something to look up here rather than read off the event. Staged
      // through a message because a `$prism` set reads the data as it was when
      // the batch began: the lookup has to happen after the id has landed.
      do: [
        { set: 'audience', value: '@event.payload' },
        // A different question is a different list, so nobody stays struck off
        // it: the ids would name people who are not in the answer any more.
        { set: 'excluded', value: [] },
        { emit: { channel: 'audience-picked' } },
      ],
    },
    {
      message: 'audience-picked',
      do: [
        {
          set: 'windowed',
          value: {
            $prism: {
              $gt: [
                {
                  $length: {
                    $filter: {
                      over: { $ref: '$.audienceOptions' },
                      as: 'o',
                      when: {
                        $and: [
                          { $eq: [{ $get: { from: { $var: 'o' }, path: ['value'] } }, { $ref: '$.audience' }] },
                          { $eq: [{ $get: { from: { $var: 'o' }, path: ['windowed'] } }, true] },
                        ],
                      },
                    },
                  },
                },
                0,
              ],
            },
          },
        },
        ...askAgain,
      ],
    },
    { event: 'ui:model', ref: 'days', do: [{ set: 'days', value: '@event.payload' }, reWindow] },

    // WHO GETS IT, when somebody asks. The sheet edits the same list this page
    // sends, and hands it back as a message — so closing it loses nothing.
    {
      event: 'ui:click',
      ref: 'recipients',
      do: [
        {
          push: {
            action: 'campaigns.recipients',
            canvas: 'sheet',
            with: ['sheet'],
            input: { audience: '$.audience', cutoff: '$.cutoff', excluded: '$.excluded' },
          },
        },
      ],
    },
    // Two hops, and the second is not ceremony: a request prism resolves
    // against the data as it was when the batch began, so re-counting in the
    // same turn as the `set` would ask with the OLD list and answer the number
    // that was already on screen.
    { message: 'recipients-chosen', do: [{ set: 'excluded', value: '@event.payload' }, { emit: { channel: 'recount' } }] },
    { message: 'recount', do: [{ call: 'writable' }] },

    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },

    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        // The window travels as the DAYS it was asked in, so the machinery can
        // re-ask the same question against its own clock rather than trusting
        // a date this screen computed minutes ago.
        { set: 'audienceDays', value: { $prism: { $case: { branches: [{ when: { $ref: '$.windowed' }, then: { $ref: '$.days' } }], else: 0 } } } },
        { emit: { channel: 'do-send' } },
      ],
    },
    {
      message: 'do-send',
      do: [
        {
          call: 'create',
          onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'campaigns-changed' } }, { pop: true }],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
  ],
};

export const campaignComposeInputSchema = z.toJSONSchema(z.object({ audience: z.string().optional() }));
