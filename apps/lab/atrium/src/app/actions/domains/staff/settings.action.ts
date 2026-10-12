import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { staffSettings, staffSetLayout, staffSetModel } from '@atrium/app/vex/service.entries';
import { MODELS } from '@atrium/app/actions/domains/staff/models';

const CHOICES = [
  { value: 'authored', title: 'Leave it to me', blurb: 'It watches and can answer, but puts nothing on your screen. You open everything yourself.', icon: 'close' },
  { value: 'mixed', title: 'Offer things beside me', blurb: 'It keeps the column at the edge and puts what it thinks you need next in there. What you open stays where you put it.', icon: 'chat' },
  { value: 'full', title: 'Set my screen up', blurb: 'It also opens the record beside your list, and whatever belongs next to that. What you click still does exactly what you clicked.', icon: 'sparkle' },
];

const MODEL_CHOICES = Object.entries(MODELS).map(([value, choice]) => ({ value, title: choice.title, blurb: choice.blurb, icon: 'sparkle' }));

const settingsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 20 },
  children: [
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'How much of your screen the assistant sets up while you work.' },
        {
          component: 'Stack',
          props: { gap: 8 },
          children: [
            {
              for: '$.choices',
              as: 'c',
              key: 'value',
              do: {
                component: 'Tile',
                ref: 'pick',
                props: {
                  title: '$c.title',
                  blurb: '$c.blurb',
                  icon: '$c.icon',
                  value: '$c.value',
                  active: { $eq: ['$c.value', '$.layoutControl'] },
                },
              },
            },
          ],
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Takes effect the next time it looks — there is nothing to save.' },
      ],
    },
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Which model it runs on.' },
        {
          component: 'Stack',
          props: { gap: 8 },
          children: [
            {
              for: '$.models',
              as: 'm',
              key: 'value',
              do: {
                component: 'Tile',
                ref: 'pick-model',
                props: {
                  title: '$m.title',
                  blurb: '$m.blurb',
                  icon: '$m.icon',
                  value: '$m.value',
                  active: { $eq: ['$m.value', '$.assistantModel'] },
                },
              },
            },
          ],
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'For comparing models. Applies to your assistant only, from its next run.' },
      ],
    },
  ],
};

export const staffSettingsAction: ActionDefinition = {
  id: 'staff.settings.form',
  title: 'Assistant',
  data: { staffId: '', layoutControl: 'mixed', assistantModel: '', settings: {}, choices: CHOICES, models: MODEL_CHOICES },
  layout: settingsLayout,
  endpoints: {
    load: {
      url: '/api/service/vex',
      method: 'POST',
      request: { fingerprint: staffSettings.fingerprint, context: { staffId: { $ref: '$.staffId' } } },
      target: 'settings',
    },
    save: {
      url: '/api/service/vex',
      method: 'POST',
      request: {
        fingerprint: staffSetLayout.fingerprint,
        context: { staffId: { $ref: '$.staffId' }, layoutControl: { $ref: '$.layoutControl' } },
      },
    },
    saveModel: {
      url: '/api/service/vex',
      method: 'POST',
      request: {
        fingerprint: staffSetModel.fingerprint,
        context: { staffId: { $ref: '$.staffId' }, assistantModel: { $ref: '$.assistantModel' } },
      },
    },
  },
  lifecycle: {
    mount: [
      {
        call: 'load',
        onSuccess: [
          { set: 'layoutControl', from: 'settings.layout_control' },
          { set: 'assistantModel', from: 'settings.assistant_model' },
        ],
      },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'layoutControl', value: '@event.payload' }, { call: 'save', onSuccess: [{ emit: { channel: 'settings-changed' } }] }] },
    { event: 'ui:click', ref: 'pick-model', do: [{ set: 'assistantModel', value: '@event.payload' }, { call: 'saveModel' }] },
  ],
};

export const staffSettingsInputSchema = z.toJSONSchema(
  z.object({ staffId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.') }),
);
