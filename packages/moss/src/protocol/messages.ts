import { z } from 'zod';
import { RenderNodeSchema } from './tree';

// The envelope: every message either end sends is JSON, and one of these.
//
// Each end parses what it is sent with the schema here, and its types are
// inferred from the same schema, so there is one definition and neither end
// can take a message in part. Every shape is exact: a field the protocol does
// not name is a message that is not read. A shape changes by PROTOCOL moving
// (./connection.ts), never by one end guessing at the other.

// One step of a frame delta (./delta.ts): a run copied from the base frame
// (offset, length), or bytes that are not in the base at all.
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
  // the shell's canvas ARRANGEMENT — a rendered layout whose CanvasSlot
  // markers the terminal resolves against its per-canvas trees
  z.strictObject({ type: z.literal('frame'), tree: z.array(RenderNodeSchema) }),
  z.strictObject({ type: z.literal('render'), canvas: z.string(), tree: z.array(RenderNodeSchema) }),
  // The same render, as a DELTA against the last frame this connection was
  // sent for this canvas. Only ever sent to a terminal that asked for deltas
  // (`?delta=1` on the upgrade) and only when a previous frame exists, so a
  // terminal that does not understand this never receives one.
  //
  // `hash` is over the rebuilt message text: a terminal that applies the ops
  // and does not land on it has diverged, and asks for a whole frame instead
  // of rendering something the server never meant.
  z.strictObject({ type: z.literal('render-delta'), canvas: z.string(), ops: z.array(DeltaOpSchema), hash: z.number() }),
  z.strictObject({ type: z.literal('error'), code: z.string(), message: z.string(), canvas: z.string().optional() }),
]);

// What the server sends. `session` is two shapes under one `type`, which a
// union discriminated on `type` cannot hold as two members, so they sit
// beside it.
export const ServerMessageSchema = z.union([
  ServerMessageByTypeSchema,
  // session GRANT (login succeeded server-side): the terminal comes back as
  // that principal — the twin of the 4403 SIGNED_OUT revoke. As the token, for
  // a terminal that keeps its own; SEALED, for one whose browser keeps the
  // session — it offers it on its next upgrade, where its browser's seal opens it.
  z.strictObject({ type: z.literal('session'), token: z.string() }),
  z.strictObject({ type: z.literal('session'), sealed: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// What a terminal sends.
export const ClientMessageSchema = z.discriminatedUnion('type', [
  // What an event IS belongs to nova: the shell it is dispatched into reads
  // it. Here it is held to being an object, and to the canvas it came from.
  z.strictObject({ type: z.literal('event'), canvas: z.string(), event: z.record(z.string(), z.unknown()) }),
  z.strictObject({ type: z.literal('publish'), channel: z.string(), payload: z.unknown().optional() }),
  // RESYNC: this terminal's frame for a canvas is not what the server thinks
  // it is — a delta failed its checksum, or arrived with no base to apply it
  // to. Answered with whole frames, which is the state both ends can always
  // agree on. Distinct from `reset`: the SHELL is fine, only this connection's
  // copy of it drifted, so nothing is torn down.
  z.strictObject({ type: z.literal('resync') }),
  // BACK: undo this session's last navigation. It names no canvas for the same
  // reason `reset` does not — back is one gesture over the whole shell, and the
  // terminal that sends it has no idea which canvas moved last (it is served
  // trees, not stacks). Protocol-level, so a browser's back button, a TUI's
  // Escape and a REPL word are the same message on one wire, and the app has to
  // author nothing to receive it.
  z.strictObject({ type: z.literal('back') }),
  // POP TO: jump straight to an ancestor already on a canvas's stack. Back
  // undoes ONE navigation; a breadcrumb that names a screen three levels down
  // is one intention, not three gestures. Three `back`s in a row race the
  // browser's own history repair and drop presses; the shell walks its own
  // stack atomically, so it is asked to.
  z.strictObject({ type: z.literal('popTo'), canvas: z.string(), instance: z.string() }),
  // RESET: throw this session's shell away and serve its replacement. The one
  // message that names no canvas, deliberately — it is the recovery for a
  // shell whose canvases are the broken thing, so it must not have to travel
  // through one. Protocol-level, not app-level: no action declares it, no
  // charter grants it, and it reaches a terminal whose every surface is dead.
  z.strictObject({ type: z.literal('reset') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
