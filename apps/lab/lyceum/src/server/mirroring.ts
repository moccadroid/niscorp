import type { FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { assistantAction } from '@lyceum/app/actions/assistant/assistant.action';

const MIRRORED = 'assistant.thread';
export const MIRROR_CHANNEL = 'assistant-mirror';

export type AssistantMirror = {
  onSession: NonNullable<NiscApp['onSession']>;
  functions: (session: FunctionSession) => Record<string, FunctionHandler>;
};

export const mirrorAssistant = (server: () => MossServer): AssistantMirror => {
  let latest: Record<string, unknown> = { ...assistantAction.data };

  return {
    // `onSession` runs before the shell exists: subscribing waits for it to
    // finish building.
    onSession: (session) => {
      if (session.principal !== 'speaker') return;
      setTimeout(() => {
        try {
          session.shell.onDataChange((change) => {
            if (session.shell.getRuntime(change.instanceId)?.definition.id !== MIRRORED) return;
            latest = change.data;
            server().shells?.deliver('stage', MIRROR_CHANNEL);
          });
        } catch {
          // No shell: no mirror for this session.
        }
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
