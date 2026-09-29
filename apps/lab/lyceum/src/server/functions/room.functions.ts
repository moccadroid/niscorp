import type { FunctionHandler } from '@niscorp/nova';
import { census } from '../census';

// WHERE THE ROOM IS. The address people open to step in — what the projector's
// QR code says, and the words beside it for anyone typing it. It is the
// deployment's (PUBLIC_URL), not the app's, so the server hands it out; every
// principal may ask, because it is on the wall anyway.
//
// And how big the app running the room is — counted from its source, for the
// slide that answers "is JSON enough?" (../census.ts). Also on the wall anyway.
export const roomFunctions = (publicUrl: string): Record<string, FunctionHandler> => ({
  'room.address': async () => ({ url: publicUrl, host: new URL(publicUrl).host }),
  'room.census': census,
});
