import type { LayoutNode } from '@niscorp/nova';

export const textLayout: LayoutNode = { component: 'Card', props: { title: '{{$.title}}' }, children: [{ component: 'Text', children: '{{$.text}}' }] };
