import type { ShellManifest } from '@niscorp/moss';
import type { Integrations } from '@niscorp/moss/integrations';
import { ATTACHABLE } from '@lyceum/app/attachable';
import type { Seats } from '@lyceum/app/attachable';

// WHAT RIDES A SEAT — the actions of approved integrations that are attached
// to it (app/attachable.ts), that this person was also granted, in the order
// of their ids. Moss's integrations keep what each bundle said of its seats;
// lyceum asks for the registered integrations back (the feature the server
// created, boot.ts) when a shell is built. An approval or a removal rebuilds
// the shells (functions/integration.functions.ts), and this is asked again.
export const attachedTo = async (integrations: Integrations<Seats>, seat: string, granted: readonly string[]): Promise<string[]> =>
  (await integrations.listIntegrations())
    .filter((integration) => integration.status === 'approved')
    .flatMap((integration) => Object.entries(integration.extension?.attachments ?? {}))
    .flatMap(([action, ridden]) => (ridden === seat && granted.includes(action) ? [action] : []))
    .sort();

// The seats whose riders go on the `attached` canvas: the controller's region,
// and the last slide's (the projector's shell holds every slide, so its riders
// wait there until that slide places the canvas). The phone's seat is not
// here: its riders are blocks on the phone's own list (./phone.ts).
const ON_THE_ATTACHED_CANVAS = Object.keys(ATTACHABLE).filter((seat) => seat !== 'member.phone');

export const attachedSeeds = (integrations: Integrations<Seats>): NonNullable<ShellManifest['seeds']> => async ({ actions }): Promise<Record<string, { action: string }[]>> => {
  const riders = (await Promise.all(ON_THE_ATTACHED_CANVAS.filter((seat) => actions.includes(seat)).map((seat) => attachedTo(integrations, seat, actions)))).flat();
  return riders.length === 0 ? {} : { attached: riders.map((action) => ({ action })) };
};
