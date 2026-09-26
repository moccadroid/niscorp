import type { LayoutNode } from '@niscorp/nova';

// One slide, as the projector shows it: a small line above, the claim, and what
// is said under it. Every slide's words are its action's data; the shape is
// the same for all of them.
export const slideLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 24, p: 64 },
  children: [
    { component: 'Text', children: '{{$.kicker}}' },
    { component: 'Text', props: { as: 'h1' }, children: '{{$.title}}' },
    { for: '$.lines', as: 'line', do: { component: 'Text', props: { as: 'p' }, children: '{{$line}}' } },
  ],
};

// The same slide, with the room counted under it — live, because the read is.
export const liveSlideLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 24, p: 64 },
  children: [
    { component: 'Text', children: '{{$.kicker}}' },
    { component: 'Text', props: { as: 'h1' }, children: '{{$.title}}' },
    { component: 'Text', props: { as: 'h2' }, children: '{{$.counts.joined}} in the room · {{$.counts.sorted}} sorted' },
    { for: '$.lines', as: 'line', do: { component: 'Text', props: { as: 'p' }, children: '{{$line}}' } },
  ],
};
