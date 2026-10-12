import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { AUDIENCES, campaignCreate } from '@lyra/app/vex/campaign.entries';

const AUDIENCE_OPTIONS = AUDIENCES.map((audience) => ({ value: audience.id, label: audience.phrase, windowed: audience.windowed }));

const FIRST = AUDIENCE_OPTIONS[0];

const question = { audience: { $ref: '$.audience' }, cutoff: { $ref: '$.cutoff' } };
// Only the writable count and the write take the exclusion. The total does not:
// striking somebody off does not take them off the studio's roll.
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
            {
              if: '$.windowed',
              then: { component: 'Input', props: { label: 'Quiet for how many days', type: 'number' }, ref: 'days', model: '$.days' },
              else: '',
            },
            { component: 'Input', props: { label: 'Subject' }, ref: 'subject', model: '$.subject' },
            { component: 'Textarea', props: { label: 'Message', rows: 12 }, ref: 'body', model: '$.body' },
          ],
        },

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
  lifecycle: { mount: [{ call: 'today' }, reWindow] },
  triggers: [
    {
      event: 'ui:model',
      ref: 'audience',
      // A `Select` dispatches its value, not the option object, so `windowed` is
      // looked up. Through a message: a `$prism` set reads the data as it stood
      // before its run of sets, and the lookup needs the new id.
      do: [
        { set: 'audience', value: '@event.payload' },
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
    { message: 'recipients-chosen', do: [{ set: 'excluded', value: '@event.payload' }, { emit: { channel: 'recount' } }] },
    { message: 'recount', do: [{ call: 'writable' }] },

    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },

    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
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
