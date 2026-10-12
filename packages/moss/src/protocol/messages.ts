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

// [0, offset, length] copies a run of the base frame; [1, text] is text the base does not hold.
export const DeltaOpSchema = z.union([z.tuple([z.literal(0), z.number(), z.number()]), z.tuple([z.literal(1), z.string()])]);
export type DeltaOp = z.infer<typeof DeltaOpSchema>;

const catalogActions = z.array(z.string()).readonly();

const ServerMessageByTypeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('hello'),
    // A server that names none speaks 1.
    protocol: z.number().default(1),
    principal: z.string().nullable(),
    catalog: z.strictObject({ actions: catalogActions, hash: z.string() }),
  }),
  z.strictObject({ type: z.literal('catalog'), actions: catalogActions, hash: z.string() }),
  z.strictObject({ type: z.literal('frame'), tree: z.array(RenderNodeSchema) }),
  z.strictObject({ type: z.literal('render'), canvas: z.string(), tree: z.array(RenderNodeSchema) }),
  z.strictObject({ type: z.literal('render-delta'), canvas: z.string(), ops: z.array(DeltaOpSchema), hash: z.number() }),
  z.strictObject({ type: z.literal('error'), code: z.string(), message: z.string(), canvas: z.string().optional() }),
]);

// `session` is two shapes under one type, which a union discriminated on the type cannot hold:
// they sit beside it.
export const ServerMessageSchema = z.union([
  ServerMessageByTypeSchema,
  z.strictObject({ type: z.literal('session'), token: z.string() }),
  z.strictObject({ type: z.literal('session'), sealed: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('event'), canvas: z.string(), event: z.record(z.string(), z.unknown()) }),
  z.strictObject({ type: z.literal('publish'), channel: z.string(), payload: z.unknown().optional() }),
  z.strictObject({ type: z.literal('resync') }),
  z.strictObject({ type: z.literal('back') }),
  z.strictObject({ type: z.literal('popTo'), canvas: z.string(), instance: z.string() }),
  z.strictObject({ type: z.literal('reset') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
