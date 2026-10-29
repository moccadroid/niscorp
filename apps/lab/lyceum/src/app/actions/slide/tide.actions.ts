import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { TriggerSchema } from '@niscorp/tide';
import { agentsSlide } from './moss.actions';
import { onceSlide, tideSlide } from './later.actions';
import { copyOf, endOf, registerOf, timerOf, titleOf } from './frame.actions';

const NAMES: Record<string, string> = { clock: 'A time', 'fact.entity': 'A write', 'fact.signal': 'A signal', 'fact.run': 'Another one ran', manual: 'By hand' };
const keyOf = (schema: z.ZodType): string => {
  const shape = schema instanceof z.ZodObject ? schema.shape : {};
  const [top = ''] = Object.keys(shape);
  const inner = shape[top];
  return top === 'fact' && inner instanceof z.ZodObject ? `fact.${Object.keys(inner.shape)[0] ?? ''}` : top;
};
const AREAS = ['one', 'two', 'three', 'four', 'five', 'six'];
const triggers = TriggerSchema.options.map((schema, index) => ({ area: AREAS[index] ?? `t${index}`, key: keyOf(schema), name: NAMES[keyOf(schema)] ?? keyOf(schema) }));

const triggersLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: [triggers.map(() => 'head').join(' '), triggers.map((trigger) => trigger.area).join(' ')], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Label', children: '{{$.kicker}}' }, { component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }] },
    { for: '$.triggers', as: 'trigger', key: 'area', do: { component: 'Cell', props: { area: '$trigger.area', align: 'center' }, children: [{ component: 'Label', children: 'on.{{$trigger.key}}' }, { component: 'Headline', props: { level: 'name' }, children: '{{$trigger.name}}' }] } },
  ],
};

export const triggersSlide: ActionDefinition = {
  id: 'slide.tide-triggers',
  title: 'Five triggers.',
  data: { kicker: 'Tide', title: 'Five triggers.', triggers },
  layout: triggersLayout,
  triggers: [],
};

const yoursLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', scale: 'page', areas: ['head head', 'controller phone'], cols: [1, 1], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Label', children: '{{$.kicker}}' }, { component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }] },
    {
      component: 'Cell',
      props: { area: 'controller', align: 'middle' },
      children: [{ if: '$.saved.controller.code', then: { component: 'Exhibit', props: { label: 'Saved on the controller · as, on, effect', text: '$.saved.controller.code', lang: 'json', marked: '$.saved.controller.marked' } }, else: { component: 'Text', props: { tone: 'muted' }, children: 'Nothing saved on the controller yet.' } }],
    },
    {
      component: 'Cell',
      props: { area: 'phone', align: 'middle' },
      children: [{ if: '$.saved.phone.code', then: { component: 'Exhibit', props: { label: 'Saved on a phone · as, on, effect', text: '$.saved.phone.code', lang: 'json', tone: 'ink', marked: '$.saved.phone.marked' } }, else: { component: 'Text', props: { tone: 'muted' }, children: 'Nothing saved on a phone yet.' } }],
    },
  ],
};

const readSaved = [{ call: 'saved' }];
export const yoursSlide: ActionDefinition = {
  id: 'slide.tide-yours',
  title: 'Yours runs as you.',
  data: { kicker: 'Tide', title: 'Yours runs as you.', saved: { controller: { code: '', marked: [] }, phone: { code: '', marked: [] } } },
  layout: yoursLayout,
  endpoints: { saved: { fn: 'room.automations', target: 'saved' } },
  lifecycle: { mount: readSaved },
  triggers: [{ message: 'timers-changed', do: readSaved }],
};

export const TIDE_SLIDE_ACTIONS: readonly ActionDefinition[] = [
  titleOf('slide.tide-title', 'Tide', 'Automation without an agent loop.'),
  registerOf('slide.tide-joined'),
  timerOf('slide.tide-timer'),
  copyOf(onceSlide, 'slide.tide-once'),
  copyOf(tideSlide, 'slide.tide-row'),
  triggersSlide,
  copyOf(agentsSlide, 'slide.tide-agents'),
  yoursSlide,
  endOf('slide.tide-end'),
];
