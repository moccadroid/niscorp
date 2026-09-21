import type { LayoutNode } from '@niscorp/nova';

// `debounce: 0` is the thesis, not a default left alone: the loop is paced on
// the SERVER (pacer.ts — a quiet timer with a ceiling, then single-flight), so
// holding keystrokes back in the browser would only hide them from the pacer
// and from the instant `heard` lane with it.
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
        // What was HEARD, the moment it was heard. "heard", not "decided": a tag
        // is a match the parser or retrieval made; the pass confirms it (it
        // lights) or drops it.
        // Whether a tag was read, matched or confirmed is said by its TONE — muted
        // until the pass confirms it — and in words only in x-ray's panel. The state
        // itself is not sent.
        { if: '$.heard.length', then: { component: 'Tags', props: { items: { $prism: { $map: { over: { $ref: '$.heard' }, as: 'tag', body: { $omit: { from: { $var: 'tag' }, keys: ['state'] } } } } } } }, else: '' },
      ],
    },
  ],
};
