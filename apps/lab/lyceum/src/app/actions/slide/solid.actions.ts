import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { endOf, registerOf, timerOf, titleOf } from './frame.actions';

export const POLL = { title: 'Tabs or spaces?', options: [{ label: 'Tabs' }, { label: 'Spaces' }, { label: 'Neither' }] };
const written = JSON.stringify(POLL, null, 2);
const cut = written.slice(0, written.indexOf('Spaces') + 3);
const parsed = (() => {
  try {
    JSON.parse(cut);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
})();

const braceLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', scale: 'page', areas: ['head head', 'cut said'], cols: [1, 1.1], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Label', children: '{{$.kicker}}' }, { component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }] },
    { component: 'Cell', props: { area: 'cut', align: 'middle' }, children: [{ component: 'Exhibit', props: { label: 'Written so far', text: '$.cut', lang: 'json', tone: 'ink' } }] },
    { component: 'Cell', props: { area: 'said', ink: 'alert', align: 'middle' }, children: [{ component: 'Label', children: 'JSON.parse' }, { component: 'Text', children: '{{$.parsed}}' }] },
  ],
};

export const braceSlide: ActionDefinition = {
  id: 'slide.solid-brace',
  title: 'JSON isn’t JSON until its last brace.',
  data: { kicker: 'Streaming', title: 'JSON isn’t JSON until its last brace.', cut, parsed },
  layout: braceLayout,
  triggers: [],
};

const STREAMED = { text: '', held: '', poll: { title: '', options: [] }, done: false, chunks: 0 };
const readStream = [{ call: 'stream' }];
const streamed = (id: string, title: string, layout: LayoutNode): ActionDefinition => ({
  id,
  title,
  data: { kicker: 'Solid', title, stream: STREAMED },
  layout,
  endpoints: { stream: { fn: 'room.stream', target: 'stream' } },
  lifecycle: { mount: readStream },
  triggers: [{ message: 'stream-changed', do: readStream }],
});
const head: LayoutNode = { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Label', children: '{{$.kicker}}' }, { component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }] };

const arrivesLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', scale: 'page', areas: ['head head', 'arrived held'], cols: [1, 1], rows: ['auto', 1] },
  children: [
    head,
    { component: 'Cell', props: { area: 'arrived', align: 'middle' }, children: [{ component: 'Exhibit', props: { label: 'Arrived · {{$.stream.chunks}} chunks', text: '$.stream.text', lang: 'json' } }] },
    { component: 'Cell', props: { area: 'held', align: 'middle' }, children: [{ component: 'Exhibit', props: { label: { $if: '$.stream.done', $then: 'Solid holds · done', $else: 'Solid holds · so far' }, text: '$.stream.held', lang: 'json', tone: 'ink' } }] },
  ],
};

const drawnLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head', 'drawn'], rows: ['auto', 1] },
  children: [
    head,
    {
      component: 'Cell',
      props: { area: 'drawn', align: 'middle' },
      children: [
        { if: '$.stream.done', then: { component: 'Label', children: 'Written' }, else: { component: 'Label', children: 'Being written' } },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.stream.poll.title}}' },
        { for: '$.stream.poll.options', as: 'option', do: { component: 'Action', props: { ink: 'paper', label: '{{$option.label}}' } } },
      ],
    },
  ],
};

export const SOLID_SLIDE_ACTIONS: readonly ActionDefinition[] = [
  titleOf('slide.solid-title', 'Solid', 'Draw it while it’s written.'),
  registerOf('slide.solid-joined'),
  timerOf('slide.solid-timer'),
  braceSlide,
  streamed('slide.solid-arrives', 'Solid reads it as it arrives.', arrivesLayout),
  streamed('slide.solid-drawn', 'The screen draws while it’s written.', drawnLayout),
  endOf('slide.solid-end'),
];
