import type { LayoutNode } from '@niscorp/nova';

// The about page's two layouts. Both draw authored words and nothing else: no
// ref, no binding a person could write through.
export const aboutPageLayout: LayoutNode = {
  component: 'Box',
  props: { px: 20, py: 28 },
  children: {
    component: 'Stack',
    props: { gap: 16, maxWidth: 620 },
    children: [
      { component: 'Hero', props: { eyebrow: '$.eyebrow', title: '$.title', subtitle: '$.lead' } },
      { component: 'Text', props: { color: 'mute' }, children: '$.body' },
    ],
  },
};

export const aboutWhoLayout: LayoutNode = {
  component: 'Box',
  props: { bg: 'surface', border: 'bottom', px: 20, py: 13 },
  children: {
    component: 'Row',
    props: { gap: 8, align: 'center' },
    children: [
      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Signed in as' },
      { component: 'Text', props: { size: 'sm' }, children: '$.name' },
    ],
  },
};
