import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { timerDocument } from '@lyceum/app/vex/timer.entries';
import type { Census } from '../census';
import { vexOver } from '../vex-over';

// WHERE THE ROOM IS. The address people open to step in — what the projector's
// QR code says, and the words beside it for anyone typing it. It is the
// deployment's (PUBLIC_URL), not the app's, so the server hands it out; every
// principal may ask, because it is on the wall anyway.
//
// And how big the app running the room is — counted from its source, for the
// slide that answers "is JSON enough?" (../census.ts). Also on the wall anyway.
//
// And the newest saved timer as the document it is stored as, printed, for the
// slide that comes back to it — read as the caller, over their own wire. The
// lines that say what it does and who it runs as are marked.
const TimerRowSchema = z.object({ reflex: z.unknown(), due_at: z.string() }).nullable();

export const roomFunctions = (session: FunctionSession, publicUrl: string, sshAddress: string, census: () => Promise<Census>): Record<string, FunctionHandler> => ({
  'room.address': async () => ({ url: publicUrl, host: new URL(publicUrl).host, ssh: sshAddress }),
  'room.census': census,
  'room.timer': async () => {
    const row = TimerRowSchema.parse(await vexOver(session.wire)(timerDocument.fingerprint));
    if (row === null) return { code: '', marked: [], due_at: '' };
    const code = JSON.stringify(row.reflex, null, 2);
    const marked = code.split('\n').flatMap((line, i) => (/^ {2}"(effect|as)":/.test(line) ? [i + 1] : []));
    return { code, marked, due_at: row.due_at };
  },
});
