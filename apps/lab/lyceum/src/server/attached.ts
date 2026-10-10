import type { ShellManifest } from '@niscorp/moss';
import type { Integrations } from '@niscorp/moss/integrations';
import { ATTACHABLE } from '@lyceum/app/attachable';

// WHAT RIDES A SEAT — the integration actions installed, approved and
// attached to a host action (app/attachable.ts), that this person was also
// granted. Moss's integrations keep the bindings; lyceum only asks for them
// back (the feature the server created, boot.ts), when a shell is built. An
// approval or a removal rebuilds the shells
// (functions/integration.functions.ts), and this is asked again.
export const attachedTo = async (integrations: Integrations, seat: string, granted: readonly string[]): Promise<string[]> =>
  (await integrations.listAttachments(seat)).map((binding) => binding.actionId).filter((action) => granted.includes(action));

// The seats whose riders go on the `attached` canvas: the controller's region,
// and the last slide's (the projector's shell holds every slide, so its riders
// wait there until that slide places the canvas). The phone's seat is not
// here: its riders are blocks on the phone's own list (./phone.ts).
const ON_THE_ATTACHED_CANVAS = Object.keys(ATTACHABLE).filter((seat) => seat !== 'member.phone');

export const attachedSeeds = (integrations: Integrations): NonNullable<ShellManifest['seeds']> => async ({ actions }): Promise<Record<string, { action: string }[]>> => {
  const riders = (await Promise.all(ON_THE_ATTACHED_CANVAS.filter((seat) => actions.includes(seat)).map((seat) => attachedTo(integrations, seat, actions)))).flat();
  return riders.length === 0 ? {} : { attached: riders.map((action) => ({ action })) };
};
