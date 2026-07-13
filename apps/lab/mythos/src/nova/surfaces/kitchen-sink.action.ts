import type { ActionDefinition } from '@niscorp/nova';

// Kit workbench (order-of-work step 3): every primitive on one surface.
// Not reachable from the app chrome; pushed by the boot dev check (and by
// hand in a console) to lock the look before features.
export const kitchenSink: ActionDefinition = {
  id: 'kitchen-sink',
  name: 'Kitchen sink',
  description: 'Every kit primitive on one surface, for development.',
  data: { spark: 0, meter: 2, draft: '' },
  triggers: [
    { event: 'ui:click', ref: 'burst', do: [{ increment: 'spark' }, { increment: 'meter' }] },
  ],
  layout: {
    component: 'Surface',
    props: { mood: 'butter', fill: true },
    children: [
      {
        component: 'Stack',
        props: { gap: 14, padding: 24, maxWidth: 720 },
        children: [
          { component: 'Text', props: { size: 'xxl', weight: 'bold' }, children: 'Kitchen sink' },
          {
            component: 'Stack',
            props: { direction: 'row', gap: 8, align: 'center', wrap: true },
            children: [
              { component: 'Button', props: { label: 'Primary', variant: 'primary' } },
              { component: 'Button', props: { label: 'Soft' } },
              { component: 'Button', props: { label: 'Ghost', variant: 'ghost' } },
              { component: 'Button', props: { label: 'Danger', variant: 'danger' } },
              { component: 'Button', props: { label: 'Disabled', disabled: true } },
              { component: 'Chip', props: { label: 'soft chip' } },
              { component: 'Chip', props: { label: 'accent', tone: 'accent' } },
              { component: 'Chip', props: { label: 'danger', tone: 'danger' } },
              { component: 'Chip', props: { label: 'ghost', tone: 'ghost' } },
            ],
          },
          {
            component: 'Card',
            props: { hover: true },
            children: [
              {
                component: 'Stack',
                props: { gap: 8 },
                children: [
                  { component: 'Text', props: { weight: 'medium' }, children: 'A card with inputs' },
                  { component: 'Input', ref: 'sink-draft', model: '$.draft', props: { value: '$.draft', placeholder: 'Type here…' } },
                  { component: 'TextArea', props: { placeholder: 'Notes…' } },
                  { component: 'Text', props: { size: 'sm', tone: 'sub' }, children: 'echo: {{$.draft}}' },
                ],
              },
            ],
          },
          {
            component: 'Stack',
            props: { direction: 'row', gap: 16, align: 'end', wrap: true },
            children: [
              { component: 'Doodle', props: { kind: 'tulip', stage: 'sprout', size: 'md' } },
              { component: 'Doodle', props: { kind: 'daisy', stage: 'bloom', size: 'md' } },
              { component: 'Doodle', props: { kind: 'poppy', stage: 'wilt', size: 'md' } },
              { component: 'Doodle', props: { kind: 'lotus', stage: 'bloom', size: 'md' } },
              { component: 'Doodle', props: { kind: 'bell', stage: 'sprout', size: 'md' } },
              { component: 'Doodle', props: { kind: 'fern', stage: 'bloom', size: 'md' } },
              { component: 'Checkbox', props: { checked: true } },
              { component: 'Checkbox', props: { checked: false } },
              { component: 'Meter', props: { value: '{{$.meter}}', max: 5, label: 'meter' } },
              { component: 'Button', ref: 'burst', props: { label: 'Confetti!', variant: 'primary' } },
            ],
          },
          { component: 'Confetti', props: { spark: '$.spark' } },
        ],
      },
    ],
  },
};
