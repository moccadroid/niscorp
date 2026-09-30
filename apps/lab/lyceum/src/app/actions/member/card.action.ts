import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { cardLayout } from './card.layout';

// Your ID card. Everybody who joined has one; it reads your row reactively —
// as the model writes your title and the line about you, the card fills in
// on its own.
export const cardAction: ActionDefinition = {
  id: 'member.card',
  description: 'The person’s ID card: their name, job title and the line about them. Shows; changes nothing.',
  title: 'Your ID card',
  data: { me: { member_id: '', name: '', title: '', quirk: '' } },
  // Openable — the phone's bar, the assistant — with nothing to pre-fill.
  input: z.toJSONSchema(z.object({})),
  layout: cardLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [],
};
