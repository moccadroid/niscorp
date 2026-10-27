import type { LayoutNode } from '@niscorp/nova';

export const textLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}', tone: '$.tone' },
  children: [{ component: 'Text', props: { tone: { $if: { $eq: ['$.tone', 'hero'] }, $then: 'lead', $else: 'default' } }, children: '{{$.text}}' }],
};
