import { z } from 'zod';
import type { FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { assistantAction } from '@lyceum/app/actions/assistant/assistant.action';
import { searchTool } from '@lyceum/app/actions/tools/search.action';

// THE SPEAKER'S SCREEN, MIRRORED ON THE STAGE — so the room watches the
// conversation, or the search, on the projector instead of a shared controller
// screen. Each mirrored thing is one action on the speaker's shell, and its
// data is the whole of what it shows: what is being typed, the wait, the
// reply, the timer it drafted; the request sent, the statement, the rows. A
// shell is server state, so the server can read it: an observer on the
// speaker's shell keeps that action's data as it changes, and tells the stage
// THAT it changed (a channel with no payload). The slide on the stage then
// asks for it by the action's id and draws it with its own layout.
//
// The stage only looks. Nothing here lets it press: the mirror is a copy of
// data, the writes are still the speaker's own.
const MIRRORED = [assistantAction, searchTool];
export const MIRROR_CHANNEL = 'speaker-mirror';

const WhichSchema = z.object({ action: z.string() });

export type SpeakerMirror = {
  onSession: NonNullable<NiscApp['onSession']>;
  functions: (session: FunctionSession) => Record<string, FunctionHandler>;
};

export const mirrorSpeaker = (server: () => MossServer): SpeakerMirror => {
  // Each mirrored action as it last stood: as it starts, until the speaker has one open.
  const latest = new Map<string, Record<string, unknown>>(MIRRORED.map((action) => [action.id, { ...action.data }]));
  const onlyTheStage = (session: FunctionSession): void => {
    if (session.principal !== 'stage') throw new Error('Only the stage mirrors the speaker’s screen.');
  };

  return {
    // Before the shell exists, like every `onSession`: subscribing waits for it
    // to finish building.
    onSession: (session) => {
      if (session.principal !== 'speaker') return;
      // A shell that failed to build has nothing to mirror, and reading it
      // throws: the mirror is a convenience and never takes the server down.
      setTimeout(() => {
        try {
          session.shell.onDataChange((change) => {
            const id = session.shell.getRuntime(change.instanceId)?.definition.id;
            if (id === undefined || !latest.has(id)) return;
            latest.set(id, change.data);
            server().shells?.deliver('stage', MIRROR_CHANNEL);
          });
        } catch {
          // No shell: no mirror for this session.
        }
      }, 0);
    },
    functions: (session) => ({
      // The speaker's assistant, for the timer slide.
      'assistant.mirror': async () => {
        onlyTheStage(session);
        return latest.get(assistantAction.id) ?? { ...assistantAction.data };
      },
      // Any mirrored action, by id — the slide says which.
      'speaker.mirror': async (input) => {
        onlyTheStage(session);
        const { action } = WhichSchema.parse(input);
        const data = latest.get(action);
        if (data === undefined) throw new Error(`Nothing of the speaker’s is mirrored under "${action}".`);
        return data;
      },
    }),
  };
};
