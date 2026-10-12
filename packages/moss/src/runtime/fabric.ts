import { z } from 'zod';

const stamp = { origin: z.string() };

export const FabricMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('invalidate-identity'), principal: z.string(), ...stamp }),
  z.strictObject({ kind: z.literal('invalidate-tenant'), tag: z.string(), ...stamp }),
  z.strictObject({ kind: z.literal('nudge'), principal: z.string(), channel: z.string(), ...stamp }),
]);

export type FabricMessage = z.infer<typeof FabricMessageSchema>;

type Unstamped<Message> = Message extends unknown ? Omit<Message, 'origin'> : never;
export type FabricSignal = Unstamped<FabricMessage>;

export type Fabric = {
  publish: (message: FabricMessage) => void;
  subscribe: (apply: (message: unknown) => void) => void;
};
