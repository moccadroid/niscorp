import type { ActionDefinition } from '@niscorp/nova';

const STREAMED = { text: '', held: '', poll: { title: '', options: [] }, done: false, chunks: 0 };
const readStream = [{ call: 'stream' }];

export const streamTool: ActionDefinition = {
  id: 'tools.stream',
  title: 'The stream',
  data: { stream: STREAMED },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'write said'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Solid — a reply being written' }] },
      { component: 'Action', ref: 'write', props: { area: 'write', ink: 'signal', label: 'Write it' } },
      {
        component: 'Cell',
        props: { area: 'said' },
        children: [{ component: 'Figure', props: { label: { $if: '$.stream.done', $then: 'Done, in chunks', $else: 'Chunks so far' }, value: '$.stream.chunks' } }],
      },
    ],
  },
  endpoints: { write: { fn: 'stream.write' }, stream: { fn: 'room.stream', target: 'stream' } },
  lifecycle: { mount: readStream },
  triggers: [
    { event: 'ui:click', ref: 'write', do: [{ call: 'write' }] },
    { message: 'stream-changed', do: readStream },
  ],
};

export const streamWatchAction: ActionDefinition = {
  id: 'stream.watch',
  title: 'Being written',
  description: 'A poll a model is writing right now, drawn from as much of it as has arrived.',
  data: { stream: STREAMED },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'title', 'options'] },
    children: [
      { component: 'Cell', props: { area: 'kick' }, children: [{ if: '$.stream.done', then: { component: 'Label', children: 'Written' }, else: { component: 'Label', children: 'Being written' } }] },
      { component: 'Cell', props: { area: 'title' }, children: [{ if: '$.stream.poll.title', then: { component: 'Headline', props: { level: 'name' }, children: '{{$.stream.poll.title}}' }, else: { component: 'Text', props: { tone: 'muted' }, children: 'Nothing written yet.' } }] },
      { component: 'Cell', props: { area: 'options' }, children: [{ for: '$.stream.poll.options', as: 'option', do: { component: 'Text', children: '○  {{$option.label}}' } }] },
    ],
  },
  endpoints: { stream: { fn: 'room.stream', target: 'stream' } },
  lifecycle: { mount: readStream },
  triggers: [{ message: 'stream-changed', do: readStream }],
};
