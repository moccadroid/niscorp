import type { Story } from '@showroom/modules/types';

import * as clock from './stories/clock.demo';
import clockSrc from './stories/clock.demo?raw';
import * as chain from './stories/chain.demo';
import chainSrc from './stories/chain.demo?raw';
import * as fanIn from './stories/fan-in.demo';
import fanInSrc from './stories/fan-in.demo?raw';
import * as retry from './stories/retry.demo';
import retrySrc from './stories/retry.demo?raw';
import * as webhook from './stories/webhook.demo';
import webhookSrc from './stories/webhook.demo?raw';
import * as catchUp from './stories/catch-up.demo';
import catchUpSrc from './stories/catch-up.demo?raw';
import * as preview from './stories/preview.demo';
import previewSrc from './stories/preview.demo?raw';
import * as calendar from './stories/calendar.demo';
import calendarSrc from './stories/calendar.demo?raw';

export const stories: readonly Story[] = [
  {
    id: 'clock',
    name: 'The clock',
    description: 'A nightly reflex. Push time forward and watch occurrences fire — then watch a second push do nothing, because a key fires once.',
    category: 'Triggers',
    kind: 'trigger',
    Demo: clock.Demo,
    source: clockSrc,
  },
  {
    id: 'webhook',
    name: 'Facts & webhooks',
    description: 'Somebody else\'s write, arriving over HTTP. Duplicate event ids drop silently; a delayed fact is a timer you can see.',
    category: 'Triggers',
    kind: 'trigger',
    Demo: webhook.Demo,
    source: webhookSrc,
  },
  {
    id: 'catch-up',
    name: 'Catch-up after downtime',
    description: 'Five missed nights, three policies: run / latest / skip. Every decision leaves a run row that says which was made.',
    category: 'Triggers',
    kind: 'trigger',
    Demo: catchUp.Demo,
    source: catchUpSrc,
  },
  {
    id: 'chain',
    name: 'Chains, not bodies',
    description: 'Charge → mark paid → receipt, as four reflexes joined by committed rows. Step one hop at a time and watch the flow walk.',
    category: 'Flows',
    kind: 'flow',
    Demo: chain.Demo,
    source: chainSrc,
  },
  {
    id: 'fan-in',
    name: 'Fan-in without a barrier',
    description: 'Five charges, one summary. A settled run mints a fact carrying its stats, so the digest is an ordinary reflex.',
    category: 'Flows',
    kind: 'flow',
    Demo: fanIn.Demo,
    source: fanInSrc,
  },
  {
    id: 'retry',
    name: 'Return vs throw',
    description: 'A decline is a domain outcome and is DONE; a gateway fault throws and is retried on bounded backoff to a terminal state.',
    category: 'Semantics',
    kind: 'semantics',
    Demo: retry.Demo,
    source: retrySrc,
  },
  {
    id: 'preview',
    name: 'Dry run as a verb',
    description: 'The real pipeline against real data with exactly one function stubbed. The members by name, the message each would get, nothing sent.',
    category: 'Semantics',
    kind: 'semantics',
    Demo: preview.Demo,
    source: previewSrc,
  },
  {
    id: 'calendar',
    name: 'DST, honestly',
    description: 'Occurrence keys are local calendar fields. Across a transition the instant shifts and the key does not — no double-fire, no skip.',
    category: 'Semantics',
    kind: 'semantics',
    Demo: calendar.Demo,
    source: calendarSrc,
  },
];
