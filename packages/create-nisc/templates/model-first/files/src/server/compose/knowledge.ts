import type { Producer } from '@niscorp/cortex';
import type { Catalog } from './catalog';
import { recordOf } from './record';

export type ComposerDeps = { catalog: Catalog };

// What a turn said, for the model to follow on from: what was asked, the sentence, and the cards shown.
export type Said = { question: string; reply: string; shown: string[] };

// The app's own paragraph: who the assistant is, and what it answers about. The rest is how a turn is made.
const ABOUT = 'You are the assistant of this app, a short tour of nisc. You answer questions about nisc and about this tour, with the tour’s cards.';

export const INSTRUCTIONS = `${ABOUT}
Each message gets one turn of a conversation: your response, and under it up to three cards that show the answer.
Cards are the app's own CARDS, each opened with an input its schema takes. Prefer them to words: when a card shows what was asked, show it. Fill in what the person asked for ("a counter that starts at 100").
Words, as a card (say), only for what no card shows.
Your response: one plain sentence of at most 120 characters that answers them. Never name ids.
What no card shows and you do not know, say so: never make anything up.
You never save anything and never press anything: a card you open is filled in, and the person does the rest.
A message may follow on from CONVERSATION SO FAR ("and the next one?"). Do not show again a card the last turn showed, unless the message asks for it changed.
Answer in the language they write in.`;

const json = (value: unknown): string => JSON.stringify(value);

const withoutDialect = (schema: unknown): Record<string, unknown> => Object.fromEntries(Object.entries(recordOf(schema)).filter(([key]) => key !== '$schema'));

export const cardCatalog = (({ deps }) =>
  `CARDS — what each shows, and its input\n${deps.catalog.actions.map((action) => `- ${action.id}: ${action.description} Input: ${json(withoutDialect(action.schema))}`).join('\n') || 'none'}`) satisfies Producer<ComposerDeps>;

export const messageInput = (message: string, said: readonly Said[]): string =>
  [
    'CONVERSATION SO FAR',
    ...(said.length === 0 ? ['nothing yet: this is its first message'] : said.map((turn) => `- they asked: ${json(turn.question)} — you said: ${json(turn.reply)} — shown: ${turn.shown.join(', ') || 'nothing'}`)),
    '',
    `MESSAGE: ${message}`,
  ].join('\n');
