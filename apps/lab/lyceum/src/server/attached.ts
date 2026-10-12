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

export const attachedSeeds = (integrations: Integrations<Seats>): NonNullable<ShellManifest['seeds']> => async ({ actions }): Promise<Record<string, { action: string }[]>> => {
  const riders = (await Promise.all(ON_THE_ATTACHED_CANVAS.filter((seat) => actions.includes(seat)).map((seat) => attachedTo(integrations, seat, actions)))).flat();
  return riders.length === 0 ? {} : { attached: riders.map((action) => ({ action })) };
};
