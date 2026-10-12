import type { LayoutNode } from '@niscorp/nova';

// `debounce: 0` on purpose: the loop is paced on the server (pacer.ts), and holding
// keystrokes back in the browser would hide them from the pacer and the `heard` lane.
export const intentLineLayout: LayoutNode = {
  component: 'Box',
  props: { tone: '$.tone', pad: 14 },
  children: [
    {
      component: 'Stack',
      props: { gap: 8 },
      children: [
        {
          component: 'Row',
          props: { gap: 14, align: 'center' },
          children: [
            { component: 'Text', props: { value: '›', variant: 'display', tone: 'accent' } },
            {
              component: 'Input',
              ref: 'line',
              model: '$.text',
              props: { value: '$.text', size: 'line', debounce: 0, autofocus: true, placeholder: 'say what is happening — “storm at 9 move headliner to the tent”' },
            },
          ],
        },
        { if: '$.heard.length', then: { component: 'Tags', props: { items: { $prism: { $map: { over: { $ref: '$.heard' }, as: 'tag', body: { $omit: { from: { $var: 'tag' }, keys: ['state'] } } } } } } }, else: '' },
      ],
    },
  ],
};
