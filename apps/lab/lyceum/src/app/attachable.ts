import { z } from 'zod';
import type { ExtensionConfig } from '@niscorp/moss/integrations';

export const ATTACHABLE: Record<string, Record<string, string>> = {
  'member.phone': {},
  'speaker.console': {},
  'slide.end': {},
};

const SeatsSchema = z
  .object({ attachments: z.record(z.string(), z.string()).default({}) })
  .strict()
  .prefault({});

export type Seats = z.infer<typeof SeatsSchema>;

export const seatsExtension: ExtensionConfig<Seats> = {
  schema: SeatsSchema,
  check: (extension, bundle) =>
    Object.entries(extension.attachments).flatMap(([actionId, seat]) => [
      ...(bundle.actions[actionId] === undefined ? [`attachment ${actionId}: no such action in this bundle`] : []),
      ...(ATTACHABLE[seat] === undefined ? [`attachment ${actionId}: attaches to "${seat}", which offers nothing`] : []),
    ]),
  contract: { attachments: 'action id → the seat it rides', seats: Object.keys(ATTACHABLE) },
};
