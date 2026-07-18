import type { LayoutNode } from '@niscorp/nova';
import { topbarTitle, topbarSearch, topbarAssistant, topbarNotifications } from './topbar.layout';

// The full topbar — ring 2, minted as `chrome.topbar.full` and granted to
// sales (admin inherits through `extends`, like every other capability).
// The write-path chrome rides with the write grants: New opens the create
// flows a sales principal actually holds; the assistant push targets an
// action a sales principal actually has. The floor (topbar.layout.ts) is
// what everyone else gets — no denies anywhere.
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
