import type { ActionDefinition } from '@niscorp/nova';
import { attentionStripLayout } from './attention-strip.layout';

export const ATTENTION_STRIP_ID = 'attention.strip';

export const attentionStripAction: ActionDefinition = {
  id: ATTENTION_STRIP_ID,
  title: 'Watching',
  description: 'What the room has noticed without being asked: how many events were triaged and how many raised, the one line the agent wrote about a critical one, how many raised cards are folded away, and whether the ceiling on event passes has bitten.',
  data: { events: 0, raised: 0, showing: 0, folded: 0, rows: 0, passes: 0, say: '', foldedSay: '', ceilingSay: '', brief: '' },
  layout: attentionStripLayout,
};
