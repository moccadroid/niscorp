import type { Story } from '@showroom/modules/types';
import { Gate } from './pages/gate';
import gateSrc from './pages/gate?raw';
import { FrontDesk } from './pages/front-desk';
import frontDeskSrc from './pages/front-desk?raw';
import { Inbox } from './pages/inbox';
import inboxSrc from './pages/inbox?raw';
import { Delegation } from './pages/delegation';
import delegationSrc from './pages/delegation?raw';
import { story as preview } from './stories/preview.story';

// Every page runs anywhere: with no API key the model is the showroom's scripted
// provider (labelled on each page); with a key, the same agents run live.
const page = (id: string, name: string, description: string, Demo: Story['Demo'], source: string): Story => ({
  id,
  name,
  description,
  category: 'Studio',
  kind: 'studio',
  doc: true,
  Demo,
  source,
});

export const stories: readonly Story[] = [
  page('front-desk', '1 · The front desk', 'A member chats with an agent that uses the studio’s tools — and your code gets typed data, not prose.', FrontDesk, frontDeskSrc),
  page('inbox', '2 · The inbox', 'Messy member emails turned into typed triage cards. A card that doesn’t fit the schema is sent back.', Inbox, inboxSrc),
  page('gate', '3 · The gate', 'The assistant refunds a member — with no gate, and with one. Approve, change the amount, or deny.', Gate, gateSrc),
  page('delegation', '4 · Agents as tools', 'The front desk can’t refund; it hands the job to the billing agent. The call tree shows who did what.', Delegation, delegationSrc),
  { ...preview, kind: 'nomodel', category: 'Preview' },
];
