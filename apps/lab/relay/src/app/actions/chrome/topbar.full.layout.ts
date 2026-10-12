import type { LayoutNode } from '@niscorp/nova';
import { topbarTitle, topbarSearch, topbarAssistant, topbarNotifications } from './topbar.layout';

export const topbarFullLayout: LayoutNode = {
  component: 'Box',
  props: { px: 18, border: 'bottom', h: 53 },
  children: {
    component: 'Row',
    props: { h: '100%', justify: 'between', align: 'center' },
    children: [
      topbarTitle,
      {
        component: 'Row',
        props: { gap: 10, align: 'center' },
        children: [
          topbarSearch,
          topbarAssistant,
          topbarNotifications,
          {
            component: 'Button',
            ref: 'new',
            props: { variant: 'primary', icon: 'plus' },
            children: 'New',
          },
        ],
      },
    ],
  },
};
