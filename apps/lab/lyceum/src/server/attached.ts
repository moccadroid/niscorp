import type { ShellManifest } from '@niscorp/moss';
import type { Integrations } from '@niscorp/moss/integrations';
import { ATTACHABLE } from '@lyceum/app/attachable';
import type { Seats } from '@lyceum/app/attachable';

export const attachedTo = async (integrations: Integrations<Seats>, seat: string, granted: readonly string[]): Promise<string[]> =>
  (await integrations.listIntegrations())
    .filter((integration) => integration.status === 'approved')
    .flatMap((integration) => Object.entries(integration.extension?.attachments ?? {}))
    .flatMap(([action, ridden]) => (ridden === seat && granted.includes(action) ? [action] : []))
    .sort();

const ON_THE_ATTACHED_CANVAS = Object.keys(ATTACHABLE).filter((seat) => seat !== 'member.phone');

export const ATTACHED = 'attached';

// What rides the `attached` canvas, of what the person holds: an integration's screens for the seats they hold.
export const attachedList = async (integrations: Integrations<Seats>, held: readonly string[]): Promise<string[]> =>
  (await Promise.all(ON_THE_ATTACHED_CANVAS.filter((seat) => held.includes(seat)).map((seat) => attachedTo(integrations, seat, held)))).flat();

export const attachedSeeds = (integrations: Integrations<Seats>): NonNullable<ShellManifest['seeds']> => async ({ actions }): Promise<Record<string, { action: string }[]>> => {
  const riders = await attachedList(integrations, actions);
  return riders.length === 0 ? {} : { [ATTACHED]: riders.map((action) => ({ action })) };
};
