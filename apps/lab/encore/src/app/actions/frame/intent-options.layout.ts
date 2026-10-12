import type { LayoutNode } from '@niscorp/nova';

const chips: LayoutNode = { for: '$.suggested', as: 'chip', key: 'id', do: { component: 'Chip', ref: 'chip', props: { label: '$.chip.label', value: '$.chip.id', accent: '$.chip.hue' } } };

const links: LayoutNode = { for: '$.links', as: 'link', key: 'text', do: { component: 'Button', ref: 'link', props: { label: '$.link.text', value: '$.link.text', variant: 'link' } } };

const row: LayoutNode = {
  component: 'Row',
  props: { gap: 8, align: 'center', wrap: true },
  children: [
    { if: '$.say', then: { component: 'Text', props: { value: '$.say', tone: 'mute' } }, else: '' },
    { if: '$.stepsUp', then: '', else: chips },
    links,
  ],
};

export const intentOptionsLayout: LayoutNode = {
  if: '$.idle',
  then: { component: 'Text', props: { value: '$.idle', tone: 'mute' } },
  else: { if: '$.say', then: row, else: { if: '$.suggested.length', then: row, else: { if: '$.links.length', then: row, else: '' } } },
};
