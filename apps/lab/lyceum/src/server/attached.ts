import { listAttachments } from '@niscorp/moss';
import type { ShellManifest } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { ATTACHABLE } from '@lyceum/app/attachable';

// WHAT RIDES A SEAT — the integration actions installed, approved and
// attached to a host action (app/attachable.ts), that this person was also
// granted. Moss keeps the bindings; lyceum only reads them back, when a shell
// is built. An approval or a removal rebuilds the shells
// (functions/integration.functions.ts), and this is read again.
export const attachedTo = async (pool: PgPool, seat: string, granted: readonly string[]): Promise<string[]> =>
  (await listAttachments(pool, seat)).map((binding) => binding.actionId).filter((action) => granted.includes(action));

// The seats whose riders go on the `attached` canvas: the controller's region,
// and the last slide's (the projector's shell holds every slide, so its riders
// wait there until that slide places the canvas). The phone's seat is not
// here: its riders are blocks on the phone's own list (./phone.ts).
const ON_THE_ATTACHED_CANVAS = Object.keys(ATTACHABLE).filter((seat) => seat !== 'member.phone');

export const attachedSeeds = (pool: PgPool): NonNullable<ShellManifest['seeds']> => async ({ actions }): Promise<Record<string, { action: string }[]>> => {
  const riders = (await Promise.all(ON_THE_ATTACHED_CANVAS.filter((seat) => actions.includes(seat)).map((seat) => attachedTo(pool, seat, actions)))).flat();
  return riders.length === 0 ? {} : { attached: riders.map((action) => ({ action })) };
};
