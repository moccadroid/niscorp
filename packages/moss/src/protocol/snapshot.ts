import { z } from 'zod';
import { RenderNodeSchema } from './tree';

// What a page drawn on the server carries beside its HTML: the screen it was
// drawn from. The server writes it into the page (../documents) and the
// terminal starts from it (../client), so the first render matches the HTML
// and the first frames off the socket confirm it rather than paint it.

// The id of the element a document carries its snapshot in.
export const SNAPSHOT_ELEMENT_ID = 'nisc-snapshot';

export const DocumentSnapshotSchema = z.strictObject({
  frame: z.array(RenderNodeSchema),
  trees: z.record(z.string(), z.array(RenderNodeSchema)),
  // The id seed an anonymous page's shell was built under; named on the first
  // connect so the socket's shell mints the same instance ids.
  seed: z.string().optional(),
  // Whether the page was rendered for a signed-in principal. A page rendered
  // for nobody is not this terminal's screen if it holds a token, and the other
  // way round — the wire then starts empty rather than from the wrong screen.
  principal: z.boolean(),
  // The path it was drawn for.
  path: z.string().optional(),
  // False when nothing on the drawn screen can still happen: the trees are the
  // whole of it, and the wire opens no socket at all (status `static`). Absent
  // is live — a page that does not say is not concluded finished.
  live: z.boolean().optional(),
});
export type DocumentSnapshot = z.infer<typeof DocumentSnapshotSchema>;
