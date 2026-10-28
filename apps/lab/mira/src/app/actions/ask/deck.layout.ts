import type { LayoutNode } from '@niscorp/nova';

const layer: LayoutNode = {
  component: 'Area',
  props: { name: '$layer.name', span: '$layer.span', row: '$layer.row', column: '$layer.column', ink: '$layer.ink', fresh: '$layer.fresh' },
  children: [
    {
      if: '$layer.tree',
      then: { component: 'Picture', props: { tree: '$layer.tree' } },
      else: { component: 'Card', props: { title: '{{$layer.title}}' }, children: [{ if: '$layer.text', then: { component: 'Text', children: '{{$layer.text}}' } }] },
    },
  ],
};

export const deckLayout: LayoutNode = {
  component: 'Deck',
  ref: 'deck',
  model: '$.selected',
  props: { selected: '$.selected' },
  children: [
    {
      for: '$.answers',
      as: 'answer',
      key: 'id',
      do: {
        component: 'Mini',
        ref: 'mini',
        props: { value: '$answer.position', selected: { $eq: ['$answer.position', '$.selected'] }, closable: '$answer.closable' },
        children: [
          { if: '$answer.closable', then: { component: 'Button', ref: 'close', props: { label: 'Close', icon: 'close', value: '$answer.position' } } },
          { component: 'Miniature', props: { columns: '$answer.columns' }, children: [{ for: '$answer.layers', as: 'layer', key: 'name', do: layer }] },
          { component: 'Text', props: { tone: 'title' }, children: '{{$answer.label}}' },
          { component: 'Text', props: { tone: 'meta' }, children: [{ if: '$answer.screen', then: 'Screen · ' }, '{{$answer.position}} of {{$.answers.length}}', { if: '$answer.showing', then: ' · showing' }] },
          { if: '$answer.question', then: { component: 'Text', props: { tone: 'quote' }, children: '“{{$answer.question}}”' } },
          { if: '$answer.response', then: { component: 'Text', props: { tone: 'muted' }, children: '{{$answer.response}}' } },
        ],
      },
    },
  ],
};
