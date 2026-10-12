import { z } from 'zod';
import type { RenderNode } from '@niscorp/nova';

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

// Nova publishes the node as a type and no schema. The annotation refuses a schema wider than
// that type, and a test refuses the two differing at all.
export const RenderNodeSchema: z.ZodType<RenderNode> = renderNodeShapes;
