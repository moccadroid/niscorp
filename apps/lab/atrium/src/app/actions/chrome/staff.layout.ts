import type { LayoutNode } from '@niscorp/nova';

// The staff chrome: who you are, which house you are in, and the way out.
//
// There is no nav bar, and its absence is the point. A nav bar is a FIXED
// affordance list — writing one means naming the destinations at design time,
// which is precisely what an application composed from resolved rows cannot
// do. This chrome used to carry eleven authored edges plus a strip of
// discovered ones, and the two were indistinguishable on screen while being
// completely different underneath.
//
// The crew's surface is now the composed `home` canvas: live action instances
// seeded from the SAME resolved read that decides a guest's home. Navigation
// is scrolling your own working surface.
export const staffChromeLayout: LayoutNode = {
  component: 'Box',
  props: { bg: 'surface', border: 'bottom', px: 20, py: 10 },
  children: [
    { component: 'Accent', props: { name: '$.accent' } },
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', gap: 20, wrap: true },
      children: [
        {
          component: 'Row',
          props: { gap: 9, align: 'center' },
          children: [
            { component: 'Icon', props: { name: 'bed', size: 17, color: 'accent' } },
            { component: 'Text', props: { serif: true, size: 'lg' }, children: '$.propertyName' },
            {
              // Unread is the one figure that belongs in chrome: it is about
              // the shift, not about a surface, and a clerk must see it
              // without opening anything.
              if: '$.unread.count',
              then: { component: 'Badge', props: { tone: 'accent' }, children: '{{$.unread.count}} unread' },
              else: '',
            },
          ],
        },
        {
          component: 'Row',
          props: { gap: 10, align: 'center' },
          children: [
            // One human, two houses: the sibling principal's property is a
            // button, and pressing it re-grants — the shell rebuilds as the
            // other single-tenant self.
            {
              if: '$.sibling.propertyName',
              then: { component: 'Button', ref: 'switch-property', props: { variant: 'quiet', icon: 'arrow' }, children: '{{$.sibling.propertyName}}' },
              else: '',
            },
            { component: 'Avatar', props: { name: '$.staffName', size: 30 } },
            {
              component: 'Stack',
              props: { gap: 0 },
              children: [
                { component: 'Text', props: { size: 'sm', weight: 600 }, children: '$.staffName' },
                { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '$.job' },
              ],
            },
            // Their own screen, theirs to set. It sits in chrome because it is
            // about the person rather than the shift — the same reason the
            // avatar and Leave are here and a board is not.
            { component: 'Button', ref: 'settings', props: { variant: 'quiet', icon: 'sliders' }, children: '' },
            { component: 'Button', ref: 'leave', props: { variant: 'plain' }, children: 'Leave' },
          ],
        },
      ],
    },
  ],
};
