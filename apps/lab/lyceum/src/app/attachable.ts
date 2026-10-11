import { z } from 'zod';
import type { ExtensionConfig } from '@niscorp/moss/integrations';

// WHERE AN INTEGRATION'S SCREENS MAY GO — lyceum's own vocabulary for a
// bundle. Moss reads a bundle's actions, grants and words; which of its
// screens rides which of this app's seats is this app's to say, so a bundle
// carries it under `extension`, and what is here reads it (handed to moss's
// integrations when the server creates them: server/boot.ts).
//
//   member.phone     the phone's list — a block among the person's actions
//   speaker.console  the controller — a region of its own, on every slide
//   slide.end        the last slide — on the projector
//
// Each seat offers nothing to its riders: no keys. Which canvas a seat's riders
// land on is the server's (server/attached.ts).
export const ATTACHABLE: Record<string, Record<string, string>> = {
  'member.phone': {},
  'speaker.console': {},
  'slide.end': {},
};

// What a bundle may say under `extension`: `attachments`, action id → the seat
// it rides. A bundle that says nothing rides none.
const SeatsSchema = z
  .object({ attachments: z.record(z.string(), z.string()).default({}) })
  .strict()
  .prefault({});

export type Seats = z.infer<typeof SeatsSchema>;

export const seatsExtension: ExtensionConfig<Seats> = {
  schema: SeatsSchema,
  // An attachment names an action the bundle ships and a seat this app offers,
  // or the bundle is refused.
  check: (extension, bundle) =>
    Object.entries(extension.attachments).flatMap(([actionId, seat]) => [
      ...(bundle.actions[actionId] === undefined ? [`attachment ${actionId}: no such action in this bundle`] : []),
      ...(ATTACHABLE[seat] === undefined ? [`attachment ${actionId}: attaches to "${seat}", which offers nothing`] : []),
    ]),
  contract: { attachments: 'action id → the seat it rides', seats: Object.keys(ATTACHABLE) },
};
