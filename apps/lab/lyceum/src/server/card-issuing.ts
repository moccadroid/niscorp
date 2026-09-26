import { createStream } from '@niscorp/solid';
import { mintSession } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { memberIssue } from '@lyceum/app/vex/member.entries';
import { CardSchema } from './issuer';
import type { Card, Issuer } from './issuer';
import { vexOver, wireAs } from './vex-over';

// ISSUING AN ID CARD, where the room can watch it happen.
//
// The model's JSON arrives through solid — an always-valid partial object at
// every chunk — and the card is written to the member's row as it grows, as
// the Ministry's `registry` principal, through the same door as every other
// write. Nothing is pushed: the ID card on their phone and the register on the
// projector are reactive reads, so the fields fill in on every screen that
// shows them.
//
// PACED, AND SAID SO. Qwen on Groq writes a whole card in about 80 ms — too
// fast to see. The chunks are fed to the parser at a reading pace (PACE), so
// the card visibly types itself in; the speaker says so on stage. The model's
// output is not changed, only how quickly it is shown.

const PACE_CHARS = 3;
const PACE_MS = 28;
const WRITE_EVERY_MS = 140;
const REGISTRY_TTL_MS = 5 * 60 * 1000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const issueCard = async (deps: {
  server: MossServer;
  pool: PgPool;
  issuer: Issuer;
  memberId: string;
  placeholder: string;
}): Promise<Card> => {
  const token = await mintSession(deps.pool, 'registry', REGISTRY_TTL_MS);
  const vex = vexOver(wireAs(deps.server, token));
  const stream = createStream({ schema: CardSchema, initial: { name: '', title: '', quirk: '' } });

  let written = '';
  const write = async (card: Card): Promise<void> => {
    const next = { memberId: deps.memberId, name: card.name.trim() === '' ? deps.placeholder : card.name, title: card.title, quirk: card.quirk };
    const key = JSON.stringify(next);
    if (key === written) return;
    written = key;
    await vex(memberIssue.fingerprint, next);
  };

  const controller = new AbortController();
  let last = 0;
  for await (const chunk of deps.issuer.write(deps.memberId, controller.signal)) {
    for (let i = 0; i < chunk.length; i += PACE_CHARS) {
      stream.write(chunk.slice(i, i + PACE_CHARS));
      await sleep(PACE_MS);
      if (Date.now() - last >= WRITE_EVERY_MS) {
        last = Date.now();
        await write(stream.current());
      }
    }
  }
  stream.close();
  const card = CardSchema.parse(await stream.final());
  await write(card);
  return card;
};
