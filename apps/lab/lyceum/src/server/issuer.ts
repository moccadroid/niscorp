import { z } from 'zod';
import { createSignal } from '@niscorp/signal';

// WHO WRITES THE ID CARDS. A model writes each newcomer's card as structured
// output — a name, a job title, one line from their file — streamed as JSON
// text; ./card-issuing.ts parses the stream and writes it to their row.
//
//   LYCEUM_ISSUER=groq   Qwen on Groq (signal's registry default), needs
//                        GROQ_API_KEY in apps/lab/lyceum/.env
//   LYCEUM_ISSUER=fake   a deterministic card from word lists, streamed in
//                        small chunks — what the checks use, and a talk with
//                        no network
//
// Unset, it is `groq` when there is a key and `fake` when there is not.

export const CardSchema = z.object({
  name: z.string().describe('A plausible full name for a new employee — first name and surname, no titles, no initials.'),
  title: z.string().describe('Their job title at the Ministry: dry, bureaucratic, faintly absurd. At most six words.'),
  quirk: z.string().describe('One line from their personnel file, in the voice of a tired clerk. At most twelve words.'),
});

export type Card = z.infer<typeof CardSchema>;

export type Issuer = {
  kind: 'groq' | 'fake';
  // The card for this seed, as JSON text in the order the model writes it.
  write: (seed: string, signal: AbortSignal) => AsyncIterable<string>;
};

// Variety without a memory: the model is handed a different first letter and
// department-store flavour per card, so forty cards in a row are not forty
// "Arthur"s.
const LETTERS = 'ABCDEFGHIJKLMNOPRSTVWZ';
const hash = (seed: string): number => [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);

const groqIssuer = (): Issuer => {
  const llm = createSignal('groq', { options: { temperature: 1, reasoningEffort: 'default' } });
  const schema = JSON.stringify(z.toJSONSchema(CardSchema));
  return {
    kind: 'groq',
    write: async function* (seed, signal) {
      const letter = LETTERS[hash(seed) % LETTERS.length] ?? 'A';
      const stream = llm.stepStream(
        {
          messages: [
            { role: 'system', content: `You issue ID cards at the Ministry. Answer with one JSON object and nothing else, matching this JSON Schema: ${schema}` },
            { role: 'user', content: `Issue an ID card for somebody who just walked in. Their first name starts with ${letter}.` },
          ],
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === 'text') yield event.text;
      }
    },
  };
};

const FIRST = ['Agnes', 'Bruno', 'Cora', 'Dmitri', 'Elsa', 'Felix', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Katya', 'Leon', 'Mira', 'Nils', 'Otto', 'Petra'];
const LAST = ['Halvorsen', 'Brandt', 'Okonkwo', 'Varga', 'Lindqvist', 'Moreau', 'Kessler', 'Duarte', 'Novak', 'Ferris'];
const TITLES = ['Deputy Keeper of Pending Forms', 'Assistant Registrar of Queues', 'Senior Clerk for Unclear Matters', 'Officer of Provisional Approvals', 'Junior Auditor of Stamps'];
const QUIRKS = ['Has never once used the lift.', 'Keeps a spare stamp for emergencies.', 'Signs everything in pencil, just in case.', 'Believes the coffee machine is a colleague.', 'Filed a complaint about the complaints box.'];

const fakeIssuer = (): Issuer => ({
  kind: 'fake',
  write: async function* (seed) {
    const n = hash(seed);
    const card: Card = {
      name: `${FIRST[n % FIRST.length] ?? 'Agnes'} ${LAST[(n >> 4) % LAST.length] ?? 'Brandt'}`,
      title: TITLES[(n >> 8) % TITLES.length] ?? 'Clerk',
      quirk: QUIRKS[(n >> 12) % QUIRKS.length] ?? 'On file.',
    };
    const text = JSON.stringify(card);
    for (let i = 0; i < text.length; i += 6) yield text.slice(i, i + 6);
  },
});

export const createIssuer = (env: Record<string, string | undefined>): Issuer => {
  const asked = env['LYCEUM_ISSUER'];
  const hasKey = (env['GROQ_API_KEY'] ?? '') !== '';
  if (asked === 'fake' || (asked !== 'groq' && !hasKey)) return fakeIssuer();
  if (!hasKey) throw new Error('lyceum: LYCEUM_ISSUER=groq needs GROQ_API_KEY in apps/lab/lyceum/.env.');
  return groqIssuer();
};
