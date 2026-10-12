import { z } from 'zod';
import { RenderNodeSchema } from './tree';

export const SNAPSHOT_ELEMENT_ID = 'nisc-snapshot';

export const DocumentSnapshotSchema = z.strictObject({
  frame: z.array(RenderNodeSchema),
  trees: z.record(z.string(), z.array(RenderNodeSchema)),
  seed: z.string().optional(),
  // Whether it was drawn for somebody signed in, not who.
  principal: z.boolean(),
  path: z.string().optional(),
  // False when nothing on the screen can still happen. Absent reads as live.
  live: z.boolean().optional(),
});
export type DocumentSnapshot = z.infer<typeof DocumentSnapshotSchema>;
