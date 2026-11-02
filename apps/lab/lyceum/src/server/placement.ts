import type { FunctionSession, NiscApp } from '@niscorp/moss';
import type { Integrations } from '@niscorp/moss/integrations';
import { reconcileCanvas } from '@niscorp/nova';
import type { Seats } from '@lyceum/app/attachable';
import { ATTACHED, attachedList } from './attached';
import { heldActions } from './held';
import { PHONE, phoneList } from './phone';

const PHONE_LIST = 'body';

// THE LISTS A LIVING SHELL KEEPS LEVEL. A shell takes in what somebody is
// given where it stands (Moss's adopt): a new action is registered, then its
// layout is set, which tells the shell's state listeners. Each list is then
// placed again: what is on it stays as it is, with whatever was typed into it,
// and what was given is added at its end. What is taken back Nova unmounts.
export const followPlacement = (integrations: Integrations<Seats>): NonNullable<NiscApp['onSession']> => (session: FunctionSession) => {
  const onCanvas = (canvasId: string): string[] => (session.shell.getState().canvases[canvasId]?.stack ?? []).map((instance) => instance.definitionId);
  const heldNow = (): string[] => [
    ...heldActions(session.shell),
    ...onCanvas(PHONE_LIST),
    ...onCanvas(ATTACHED),
  ];
  const lists = async (held: readonly string[]): Promise<[string, string[]][]> => [
    ...(held.includes(PHONE) ? [[PHONE_LIST, await phoneList(integrations, held)] as [string, string[]]] : []),
    [ATTACHED, await attachedList(integrations, held)],
  ];

  let placing = false;
  let again = false;
  const place = async (): Promise<void> => {
    if (placing) {
      again = true;
      return;
    }
    placing = true;
    try {
      do {
        again = false;
        const wanted = await lists(heldNow());
        const held = heldNow();
        for (const [canvasId, actions] of wanted) {
          if (session.shell.getState().canvases[canvasId] === undefined) continue;
          reconcileCanvas(session.shell, canvasId, actions.filter((id) => held.includes(id)).map((actionId) => ({ actionId })), { origin: 'placement', own: 'canvas' });
        }
      } while (again);
    } finally {
      placing = false;
    }
  };

  // `onSession` runs before the shell exists.
  setTimeout(() => {
    session.shell.onStateChange(() => void place().catch((error: unknown) => console.error('[lyceum] a list could not be placed again:', error)));
  }, 0);
};
