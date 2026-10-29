import { z } from 'zod';
import type { FunctionDefinition, FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import { assistantAction } from '@lyceum/app/actions/assistant/assistant.action';
import { askTool } from '@lyceum/app/actions/ask/ask.actions';
import { searchTool } from '@lyceum/app/actions/tools/search.action';

const MIRRORED = [assistantAction, searchTool, askTool];
export const MIRROR_CHANNEL = 'speaker-mirror';

const WhichSchema = z.object({ action: z.string() });

export type SpeakerMirror = {
  onSession: NonNullable<NiscApp['onSession']>;
  functions: (session: FunctionSession) => FunctionDefinition[];
};

export const mirrorSpeaker = (server: () => MossServer): SpeakerMirror => {
  const latest = new Map<string, Record<string, unknown>>(MIRRORED.map((action) => [action.id, { ...action.data }]));
  const onlyTheStage = (session: FunctionSession): void => {
    if (session.principal !== 'stage') throw new Error('Only the stage mirrors the speaker’s screen.');
  };

  return {
    // `onSession` runs before the shell exists: subscribing waits for it to
    // finish building.
    onSession: (session) => {
      if (session.principal !== 'speaker') return;
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
    functions: (session) => [
      {
        id: 'assistant.mirror',
        description: 'Answers the data of the speaker’s assistant thread as it last changed. The stage only. Send nothing.',
        execute: async () => {
          onlyTheStage(session);
          return latest.get(assistantAction.id) ?? { ...assistantAction.data };
        },
      },
      {
        id: 'speaker.mirror',
        description: 'Answers the data of one of the speaker’s mirrored actions as it last changed. The stage only. Send { action }, the action’s id.',
        execute: async (input) => {
          onlyTheStage(session);
          const { action } = WhichSchema.parse(input);
          const data = latest.get(action);
          if (data === undefined) throw new Error(`Nothing of the speaker’s is mirrored under "${action}".`);
          return data;
        },
      },
    ],
  };
};
