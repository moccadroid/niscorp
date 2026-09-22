import { defineAgent, duration, outputRetries, stepCount } from '@niscorp/cortex';
import type { AgentDefinition, OutputValidator, Producer } from '@niscorp/cortex';
import { ANSWER_MAX_CHARS, ANSWER_MAX_SENTENCES, AnswerDataSchema, FOLLOW_UPS_MAX } from './contract';
import type { AnswerData } from './contract';
import { runFacts } from './run-facts';

// ═══════════════════════════════════════════════════════════
// THE AGENT — the slow speed. Defined ONCE, at module scope.
//
// An agent is configuration, not an object with a lifetime: tools arrive on the
// run (they close over a session's wire and policy), the model arrives on the
// run, and what differs between two turns is `deps` and the input. Rebuilding
// the definition per call is the pattern cortex's typed deps exist to delete.
//
// ONE PROMPT, ONE CONTRACT, EVERY FINISHED SENTENCE. It is handed the same state
// each time and everything it may return is optional — words, cards to add or
// aim, words for a form, steps — including nothing at all, which is the right
// answer when the cards already say it. What it NEVER does is act:
// it has two tools and both read; it returns a state and the loop applies it;
// the forms it opens have their own buttons and a person presses them.
//
// THE PROMPT, IN ORDER (cortex assembles it; `agent.preview()` shows it):
//
//   instructions        identity and the law            ┐
//   tool guides         each tool teaches itself        │ fixed for the life of
//   the contract        JSON Schema, from contract.ts   │ the agent — a provider's
//   theRoom             what the five regions are for   │ prefix cache holds it
//   howToAnswer         how to decide                   ┘
//   ── the run's input ──
//   the thread          the conversation so far, as messages
//   pre-decisions       Jev's work for THIS sentence, as a system message
//   the operator's line
//
// Every producer is static, so a provider's prefix cache holds all of it. The
// thread and the pre-decisions are the run's INPUT, not producers:
// cortex places producers before the input, and the pre-decisions have to sit
// between the conversation and its last line.
// ═══════════════════════════════════════════════════════════

export type AgentDeps = Record<string, never>;

// Identity and the law. A few sentences — what the answer may contain is the
// contract's business, and the contract explains itself.
const INSTRUCTIONS = [
  'You are the second, slower mind of Encore: the operations room of a three-day music festival. The operator types what is happening; a fast model has already read the sentence and arranged cards on screen. You are called on every finished sentence, for what cards alone cannot do: say what matters, add or aim a card, write words into a form, propose steps. EVERYTHING you may return is optional. When the cards on screen already say it, return nothing at all — an empty `response` and no data is a correct answer, and the common one.',
  'THE LAW: you never act. You cannot press a button, submit a form, send a message or change a record, and you must never say that you did. You say things, and you return a description of the screen; a person reads it and decides.',
  'Work from what you are handed and what your two read tools return. Never invent an id, a name, a time or a number. If you do not know, say so plainly.',
  `Your \`response\`, when you give one, is what the operator reads, beside the cards: AT MOST ${ANSWER_MAX_SENTENCES} SENTENCES (${ANSWER_MAX_CHARS} characters), plain text, the answer first, no markdown, no preamble. Prefer what the cards on screen do not already show: what MATTERS, what CONNECTS them, or what is on NONE of them. If the cards are the whole answer, leave \`response\` empty. A third sentence is refused and you will be asked again.`,
  'You are briefing someone who is looking at a screen of cards, so your words and their cards are ONE thing: every sentence that a card supports CITES that card (`claims`), and if the card that would support a sentence is not on screen, you PUT it there (`canvases`) and cite it. An answer in words alone, beside a room that does not show what it says, is half an answer.',
].join('\n');

const theRoom = (() =>
  [
    'THE ROOM — five regions, each a question; a card lives on exactly one:',
    'doing: what are you doing? Forms that change something. Prefilled, never submitted for them.',
    'about: who or what is this about? Record cards.',
    'where: where is it? The site map.',
    'when: when is it? Running order, weather at an hour.',
    'nearby: what else matters? Overviews, gauges, charts, feeds.',
  ].join('\n')) satisfies Producer<AgentDeps>;

const howToAnswer = (() =>
  [
    'HOW TO DECIDE:',
    'The fast model has usually put the right cards up already — SCREEN shows them. Do not re-open what is there. You only ADD and AIM: a card already up stays up, and you cannot close one. When the evidence for what you say is NOT on screen and an action in ACTIONS would show it, place that card (`canvases`) and cite it. Keys marked * in ACTIONS are required to open a card.',
    'WRITABLE lists free-text fields on screen nobody has typed in: write them (`fields`) for the people who will read them, FROM what the forms in SCREEN currently hold. When the operator asks what to do, propose the few `steps` that resolve it — forms ([doing]), filled in as far as the pre-decisions allow; nothing opens until they press one.',
    'When the line is an EVENT nobody asked about (FACTS.standing lists what is standing right now), a card for it is already up with the reading on it: write the ONE sentence it cannot — how the standing causes compound, naming every place involved — and return nothing else.',
    `Then, only if something SPECIFIC to this answer is worth asking next, suggest it (\`followUps\`): at most ${FOLLOW_UPS_MAX} short sentences the operator would actually type, about the rows and the problem of THIS turn. ASKED lists everything this thread has already asked or been offered — never repeat one of those, never offer a generic question that would fit any answer. None is better than furniture.`,
    'WANTED lists cards the fast model wanted on screen and could not aim, with what each needs ("act.card — wanted 0.70 — needs: an act"). It only knows the rows the operator NAMED; you were handed facts. When FACTS or a lookup SETTLES which row is meant — the act on stage now, the zone that is full — place that card aimed at that row (`canvases`, with the id exactly as it appears in FACTS or the lookup) and cite it. When they do not settle it, leave it: never guess a row, and never use an id you were not handed.',
    'FACTS were read for you a moment ago. Answer from them first. Use a tool only for a figure or a row you were not handed; one lookup is normal, five is a wander.',
    'The conversation above is what this operator said and what was done about it — including things the cards handled without you, marked [cards only]. "Then", "that one", "tomorrow" refer to it.',
  ].join('\n')) satisfies Producer<AgentDeps>;

// THE PER-RUN HALF OF THE CONTRACT. The schema above it is static — it has to
// be, the agent is a module — so "an action Jev did not rank", "a row that was
// not offered" and "a field nobody listed" are refused here, by the one
// admission rule, and go back to the model as a correction while its tools are
// still warm. The facts come from the run's own scope (run-facts.ts).
const admitted: OutputValidator<AnswerData> = (output) => {
  // The words are judged with the data: the length bound is an admission rule
  // like any other, so the model is told and retries.
  const refusals = runFacts.getStore()?.refusals(output.data, output.response ?? '') ?? [];
  return refusals.length === 0 ? { ok: true } : { retry: refusals.join('; ') };
};

export const encoreAgent: AgentDefinition<AnswerData, AgentDeps> = defineAgent<AnswerData, AgentDeps>({
  id: 'encore.agent',
  description: 'The slower mind of the Encore ops room: says what matters, adds and aims cards, writes words, proposes steps — or nothing; never acts.',
  instructions: INSTRUCTIONS,
  context: [theRoom, howToAnswer],
  // `response` is OPTIONAL (cortex's default beside a schema): saying nothing is a
  // correct answer when the cards already say it.
  //
  // NO `strategy`. On Groq's gpt-oss-120b signal resolves `emit` — the envelope
  // on the content channel — because that model stringifies nested arrays in
  // tool arguments (registry: `manglesNestedToolArgs`). Pinning a strategy here
  // would take that resolution away; the tools below stay flat for the same
  // reason.
  output: { schema: AnswerDataSchema, validate: admitted },
  // A typical run is ONE step — the facts are already in the prompt. Six is
  // room for a lookup or two and a correction, not for a wander; somebody is
  // watching a card say "answering".
  stopWhen: [stepCount(6), duration('45s'), outputRetries(2)],
});
