import { z } from 'zod';
import type { RenderNode } from '@niscorp/nova';

// A rendered tree, as it crosses the wire or sits in a drawn page.
//
// The grammar is nova's: its renderer makes these nodes on the server and its
// adapters draw them in the terminal. Nova says it as a type and publishes no
// schema, so the schema is here, held to that type from both sides — the
// annotation below refuses a schema that lets through something nova's type
// does not have, and test/protocol.test.ts refuses the two differing at all,
// so a node nova changes fails moss's typecheck until this follows.
//
// Exact, like the messages around it: a node with a field this does not name
// is a tree this terminal would draw wrong, and the frame is not shown.

const key = z.string().optional();
const children = z.lazy(() => z.array(RenderNodeSchema));

export const renderNodeShapes = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('component'),
    name: z.string(),
    props: z.record(z.string(), z.unknown()),
    children,
    ref: z.string().optional(),
    key,
    model: z.strictObject({ path: z.string(), ref: z.string() }).optional(),
  }),
  z.strictObject({ type: z.literal('text'), value: z.string(), key }),
  z.strictObject({ type: z.literal('fragment'), children, key }),
  z.strictObject({ type: z.literal('error'), code: z.string(), message: z.string(), nodeRef: z.string().optional(), key }),
]);

export const RenderNodeSchema: z.ZodType<RenderNode> = renderNodeShapes;
