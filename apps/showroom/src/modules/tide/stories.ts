import type { Story } from '@showroom/modules/types';

import { BreaksCron } from './pages/breaks-cron';
import breaksCronSrc from './pages/breaks-cron?raw';
import { Billing } from './pages/billing';
import billingSrc from './pages/billing?raw';
import { BuildAReflex } from './pages/build-a-reflex';
import buildSrc from './pages/build-a-reflex?raw';
import { OneBookingChain } from './pages/chain';
import chainSrc from './pages/chain?raw';
import { SameWebhookTwice } from './pages/webhook';
import webhookSrc from './pages/webhook?raw';
import { TonightsDigest } from './pages/digest';
import digestSrc from './pages/digest?raw';

// Six pages, read in order — the landing page ("What tide is for", a doc)
// links them. Full-width: the reflexes, the phones and the ledger are on the page.
export const stories: readonly Story[] = [
  {
    id: 'breaks-cron',
    name: '1 · What breaks cron',
    description: 'One nightly job, five bad weeks — a crash halfway, both daylight-saving nights, three nights down. Cron and tide side by side.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: BreaksCron,
    source: breaksCronSrc,
  },
  {
    id: 'billing',
    name: '2 · The billing run',
    description: 'Preview who will be charged, then run it: a declined card and a flaky gateway, against a script that retries everything.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: Billing,
    source: billingSrc,
  },
  {
    id: 'build-a-reflex',
    name: '3 · Build a reflex',
    description: 'Pick when, who and how — see the reflex, preview who would get what, then switch it on and run a week onto six phones.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: BuildAReflex,
    source: buildSrc,
  },
  {
    id: 'chain',
    name: '4 · One booking, a chain of events',
    description: 'Mia books, cancels, the class comes and goes: confirmations, reminders, feedback and the waitlist, each hop its own row.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: OneBookingChain,
    source: chainSrc,
  },
  {
    id: 'webhook',
    name: '5 · The same webhook, twice',
    description: 'A payment provider retries and reorders its events. The usual handler double-books and flips status; tide dedupes and keeps the newest.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: SameWebhookTwice,
    source: webhookSrc,
  },
  {
    id: 'digest',
    name: '6 · Tonight’s digest',
    description: 'Six reminders, some failing; one summary email to Olivia when the last lands — and not again after a retry.',
    category: 'Studio',
    kind: 'studio',
    doc: true,
    Demo: TonightsDigest,
    source: digestSrc,
  },
];
