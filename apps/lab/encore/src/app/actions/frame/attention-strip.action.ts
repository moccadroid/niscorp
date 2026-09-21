import type { ActionDefinition } from '@niscorp/nova';
import { attentionStripLayout } from './attention-strip.layout';

// THE ROOM IS WATCHING — and this strip is how it says so.
//
// Nobody types for this. Every write a feed makes is re-read, merged and put to
// Jev as an event; nearly all of them answer "nothing", and THAT is the number
// on this strip: "412 events triaged · 3 raised". What was raised is on the
// `attention` canvas beside it, four at most; the rest fold into one counted
// line here — folded, not dropped: they are raised, they are on the rail, and
// they come up as room is made. When Jev calls an event critical the agent adds
// one line, and it lands here.
//
// Written by the watcher (server/watch/watch.ts). No `input`, no placement: it
// is furniture, and it draws nothing at all until the first event arrives.
export const ATTENTION_STRIP_ID = 'attention.strip';

export const attentionStripAction: ActionDefinition = {
  id: ATTENTION_STRIP_ID,
  title: 'Watching',
  description: 'What the room has noticed without being asked: how many events were triaged and how many raised, the one line the agent wrote about a critical one, how many raised cards are folded away, and whether the ceiling on event passes has bitten.',
  data: { xray: false, events: 0, raised: 0, showing: 0, folded: 0, rows: 0, passes: 0, say: '', foldedSay: '', ceilingSay: '', brief: '' },
  layout: attentionStripLayout,
};
