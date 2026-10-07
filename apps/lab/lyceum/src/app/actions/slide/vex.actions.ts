import type { ActionDefinition } from '@niscorp/nova';
import { stageRegisterAction } from '@lyceum/app/actions/stage/register.action';
import { openingTitleLayout } from './opening.layouts';
import { endSlide } from './later.actions';
import { writerLayout } from './vex.layouts';

// THE VEX TALK'S SLIDES (db/vex.deck.ts). A slide is an action, and an action
// is in one talk, so the slides this talk shares with the nisc talk — the way
// in, the register, the close — are actions of their own over the same
// layouts, with this talk's words.

export const vexTitleSlide: ActionDefinition = {
  id: 'slide.sixtools',
  title: 'Vex',
  data: { title: 'Vex', line: 'Six tools and no SQL.', address: { url: '', host: '', ssh: '' } },
  layout: openingTitleLayout,
  endpoints: { address: { fn: 'room.address', target: 'address' } },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
};

// The register, as this talk's slide: everybody who joined, live.
export const vexRegisterSlide: ActionDefinition = { ...stageRegisterAction, id: 'slide.joined', title: 'Everyone who has joined' };

// The speaker's question, as the engine sees it being answered: the trace the
// server keeps of the speaker's newest generation (server/generation), read
// on mount and again whenever the server says it changed. Nothing on it can
// be pressed; the question is asked on the controller (tools.ask).
export const writerSlide: ActionDefinition = {
  id: 'slide.writer',
  title: 'Watch it write one.',
  data: {
    kicker: 'Live · the speaker’s question, as the engine sees it',
    title: 'Watch it write one.',
    trace: { principal: '', intent: '', shape: '', shown: { tables: '', caller: '' }, steps: [], outcome: { kind: 'none', text: 'Nothing asked yet.', fingerprint: '', sql: '' }, ms: 0 },
  },
  layout: writerLayout,
  endpoints: { generation: { fn: 'room.generation', target: 'trace' } },
  lifecycle: { mount: [{ call: 'generation' }] },
  triggers: [{ message: 'generation-changed', do: [{ call: 'generation' }] }],
};

export const vexEndSlide: ActionDefinition = { ...endSlide, id: 'slide.folder' };

export const VEX_SLIDE_ACTIONS: readonly ActionDefinition[] = [vexTitleSlide, vexRegisterSlide, writerSlide, vexEndSlide];
