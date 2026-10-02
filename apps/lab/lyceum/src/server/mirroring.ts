import type { FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { assistantAction } from '@lyceum/app/actions/assistant/assistant.action';

// THE SPEAKER'S ASSISTANT, MIRRORED ON THE STAGE — so the room watches the
// conversation on the projector instead of a shared controller screen. The
// assistant is one action on the speaker's shell (`assistant.thread`), and its
// data is the whole conversation as it stands: what is being typed, the wait,
// the reply, the timer it drafted. A shell is server state, so the server can
// read it: an observer on the speaker's shell keeps that action's data as it
// changes, and tells the stage THAT it changed (a channel with no payload). The
// slide on the stage then asks for it (`assistant.mirror`) and draws it with
// the assistant's own layout.
//
// The stage only looks. Nothing here lets it press: the mirror is a copy of
// data, the conversation's writes are still the speaker's own.
const MIRRORED = 'assistant.thread';
export const MIRROR_CHANNEL = 'assistant-mirror';

export type AssistantMirror = {
  onSession: NonNullable<NiscApp['onSession']>;
  functions: (session: FunctionSession) => Record<string, FunctionHandler>;
};

export const mirrorAssistant = (server: () => MossServer): AssistantMirror => {
  // The speaker's assistant, as it last stood: as it starts, until they have one open.
  let latest: Record<string, unknown> = { ...assistantAction.data };

  return {
    // Before the shell exists, like every `onSession`: subscribing waits for it
    // to finish building.
    onSession: (session) => {
      if (session.principal !== 'speaker') return;
      setTimeout(() => {
        session.shell.onDataChange((change) => {
          if (session.shell.getRuntime(change.instanceId)?.definition.id !== MIRRORED) return;
          latest = change.data;
          server().shells?.deliver('stage', MIRROR_CHANNEL);
        });
      }, 0);
    },
    functions: (session) => ({
      'assistant.mirror': async () => {
        if (session.principal !== 'stage') throw new Error('Only the stage mirrors the speaker’s assistant.');
        return latest;
      },
    }),
  };
};
