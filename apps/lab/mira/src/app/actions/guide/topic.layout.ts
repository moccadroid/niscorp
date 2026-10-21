import type { LayoutNode } from '@niscorp/nova';

export const topicLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [{ for: '$.paragraphs', as: 'paragraph', do: { component: 'Text', children: '{{$paragraph}}' } }],
};
