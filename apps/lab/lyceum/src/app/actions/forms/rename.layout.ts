import type { LayoutNode } from '@niscorp/nova';

export const renameLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'now', 'field', 'save', 'rest'], rows: ['auto', 'auto', 'auto', 'auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'live' }, children: [{ component: 'Label', children: 'Forms · change your record' }] },
    { component: 'Cell', props: { area: 'now' }, children: [{ component: 'Label', children: 'On record' }, { component: 'Headline', props: { level: 'name' }, children: '{{$.me.name}}' }] },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'A new name', enter: 'clears' } },
    { component: 'Action', ref: 'save', props: { area: 'save', ink: 'alert', label: 'File the change →' } },
    {
      component: 'Cell',
      props: { area: 'rest' },
      children: [
        { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        { if: '$.saved', then: { component: 'Text', props: { tone: 'muted' }, children: 'Filed. Every screen that shows your name has it now.' } },
      ],
    },
  ],
};
