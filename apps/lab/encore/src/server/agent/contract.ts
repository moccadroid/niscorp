import { z } from 'zod';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';

// ═══════════════════════════════════════════════════════════
// WHAT THE AGENT RETURNS — the `data` half of cortex's envelope.
//
// The envelope is used as designed (DESIGN.md § What it returns): `response`
// IS the answer, required, and is never spelled a second time in here. `data`
// holds what is the ROOM's — the screen — and nothing else.
//
// AGENTS rule 15: this schema is the contract. cortex injects its JSON Schema
// into the prompt; every constraint the model has to honour is a `.describe()`
// below, and the prompt has no section explaining "how to fill in the answer".
//
// This is the STATIC shape, because the agent is defined once, at module scope,
// and a module cannot know which six actions Jev will rank highest for a
// sentence nobody has typed. What a run may actually name is narrower — those
// six, their own input contracts, the candidate rows of that pass — and that
// is enforced when the answer lands, by the one admission rule the chips and
// the plan steps go through too (intent/admission.ts). Rejected whole.
//
// Optional fields are `.nullish()`: models say null for "absent".
// ═══════════════════════════════════════════════════════════

// The Card shape appears once per canvas and once per step in the generated
// JSON Schema, so ITS descriptions are kept to a line and the rules about a
// card's input are stated ONCE, on `canvases` — a description repeated six
// times is a prompt paying six times for one sentence.
const Input = z.record(z.string(), z.unknown()).describe('What to open it with — see the INPUT RULE.');

const Card = z.strictObject({
  actionId: z.string().describe('An action id from ACTIONS. No other id exists.'),
  input: Input,
});

const CANVASES =
  'Cards to put on screen as evidence for your answer. COMPLETE STATE per canvas you name: list every card that canvas should hold, and a card you leave out of a canvas you named is closed. A canvas you do not name is left exactly as it is — so name none unless the answer needs one. Each action belongs on the one canvas ACTIONS gives it in [brackets]. INPUT RULE, for every `input` here and in `steps`: only keys that action lists under `input:` in ACTIONS, only row ids that appear in ROWS or RESOLVED, only values the pre-decisions support; leave out what you do not know — a person fills the rest.';

export const FOLLOW_UP_MAX_CHARS = 60;
export const FOLLOW_UPS_MAX = 2;

// THE ANSWER IS TWO SENTENCES. The operator is looking at the cards; an answer
// that lists what a card lists is a wall of text beside the thing it describes.
// The bounds live HERE, with the rest of the contract the model reads, and are
// ENFORCED by admission (intent/admission.ts) — by refusing the answer with the
// reason, never by cutting it: half a sentence is worse than a long one.
// (`response` is cortex's envelope field, not a key of this schema, so its bound
// cannot be a `.max()` on it: it is said in the schema's own description and in
// the instructions, both from these constants.)
export const ANSWER_MAX_SENTENCES = 2;
export const ANSWER_MAX_CHARS = 320;
// How many things a card already shows an answer may name before it is reciting.
export const RECITE_MAX = 2;

export const AnswerDataSchema = z.strictObject({
  claims: z
    .array(
      z.strictObject({
        text: z.string().min(1).describe('An EXACT substring of your `response` — copy it character for character: the sentence, or the part of one, that this card supports.'),
        card: z.string().describe('The action id of the card those words stand on. It must be ON SCREEN when your answer lands: listed under SCREEN, or placed by this answer in `canvases`.'),
        row: z.string().nullish().describe('Optionally, the id of the one row in that card the words are about — an id from ROWS, RESOLVED or FACTS.'),
      }),
    )
    .max(8)
    .nullish()
    .describe('CITE YOUR ANSWER. One entry per sentence of `response` that a card on screen supports, so the operator can point at a sentence and see the card it came from. A sentence you cannot cite is shown to them as unsupported — so if the card that would support it is not on screen, PLACE it in `canvases` and cite it. A claim whose text is not in `response`, or whose card is not on screen, is dropped.'),
  followUps: z
    .array(z.string().min(1).describe(`One complete sentence the operator might type next, in their voice, at most ${FOLLOW_UP_MAX_CHARS} characters: "what are our options", not "Options?".`))
    .max(FOLLOW_UPS_MAX)
    .nullish()
    .describe(`At most ${FOLLOW_UPS_MAX} questions worth asking NEXT, specific to this answer — its rows, its problem. Never one that ASKED already lists, never one that would fit any answer; omit the key when nothing specific remains. Pressing one types it into their line — it is a suggestion of what to SAY, never an action you take.`),
  canvases: z
    .strictObject(Object.fromEntries(QUESTION_CANVASES.map((canvas) => [canvas, z.array(Card).max(4).nullish()])))
    .nullish()
    .describe(CANVASES),
  fields: z
    .array(
      z.strictObject({
        card: z.string().describe('The action id of a card listed under WRITABLE.'),
        field: z.string().describe('The field of that card listed under WRITABLE.'),
        text: z.string().min(1).max(320).describe('The words, as the people who receive them will read them. Plain sentences.'),
      }),
    )
    .nullish()
    .describe('Words for free-text fields of cards ALREADY on screen — only the pairs listed under WRITABLE. At most one entry per field. A field a person has typed in is not listed and must not be written.'),
  steps: z
    .array(
      z.strictObject({
        say: z.string().min(1).max(120).describe('One line the operator reads: the action to take and why now, in the imperative ("Move Nova Kestrel under cover before 21:00"). Not "check", "review" or "look at" — they can already see those cards.'),
        actionId: z.string().describe('The action this step opens when pressed — an id from ACTIONS, preferably a form ([doing]).'),
        input: Input,
      }),
    )
    .max(6)
    .nullish()
    .describe('A plan, in order, most consequential first — only when the operator asked what to DO. Each step opens one prefilled form when pressed; nothing is submitted for them. Leave empty when answering a question or writing words.'),
}).describe(`What goes beside your \`response\`. The response itself: AT MOST ${ANSWER_MAX_SENTENCES} sentences, ${ANSWER_MAX_CHARS} characters, and never a recital of what a card on screen already shows (more than ${RECITE_MAX} of a card's own rows named is a recital). An answer over either bound is refused and you are asked again.`);

export type AnswerData = z.infer<typeof AnswerDataSchema>;
