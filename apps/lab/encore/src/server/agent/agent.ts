import { defineAgent, duration, outputRetries, stepCount } from '@niscorp/cortex';
import type { AgentDefinition, OutputValidator, Producer } from '@niscorp/cortex';
import type { RunMode } from '@encore/server/intent/intent.types';
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
// It answers, it writes words into fields, and it proposes plans — one
// mechanism for all three (DESIGN.md § The agent). What it NEVER does is act:
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
//   thisTurnIs          one of three sentences, by mode
//   ── the run's input ──
//   the thread          the conversation so far, as messages
//   pre-decisions       Jev's work for THIS sentence, as a system message
//   the operator's line
//
// Static first, the one dynamic block last, so the cache breaks at the end
// rather than in the middle (atrium chat.ts; Midas throws on a block out of
// order). The thread and the pre-decisions are the run's INPUT, not producers:
// cortex places producers before the input, and the pre-decisions have to sit
// between the conversation and its last line.
// ═══════════════════════════════════════════════════════════

export type AgentDeps = { mode: RunMode };

// Identity and the law. A few sentences — what the answer may contain is the
// contract's business, and the contract explains itself.
const INSTRUCTIONS = [
  'You are the second, slower mind of Encore: the operations room of a three-day music festival. The operator types what is happening; a fast model has already read the sentence and arranged cards on screen. You are called for what cards alone cannot do — answer in words, write words into a form, or propose what to do.',
  'THE LAW: you never act. You cannot press a button, submit a form, send a message or change a record, and you must never say that you did. You say things, and you return a description of the screen; a person reads it and decides.',
  'Work from what you are handed and what your two read tools return. Never invent an id, a name, a time or a number. If you do not know, say so plainly.',
  `Your \`response\` is what the operator reads, beside the cards: AT MOST ${ANSWER_MAX_SENTENCES} SENTENCES (${ANSWER_MAX_CHARS} characters), plain text, the answer first, no markdown, no preamble. NEVER restate what a card on screen already shows — not the acts, not the times, not the list of incidents: they can see them. Say what MATTERS, what CONNECTS the cards, or what is on NONE of them. If the cards are the whole answer, say one short sentence pointing at them. A third sentence, or a recital, is refused and you will be asked again.`,
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
    'The fast model has usually put the right cards up already — SCREEN shows them. Do not re-open what is there, and do not rearrange a region to be helpful. But a sentence needs a card to stand on: when the evidence for what you say is NOT on screen and an action in ACTIONS would show it, place that card — naming its canvas with the cards already there kept in the list, or they are closed — and cite it. Keys marked * in ACTIONS are required to open a card.',
    `Then, only if something SPECIFIC to this answer is worth asking next, suggest it (\`followUps\`): at most ${FOLLOW_UPS_MAX} short sentences the operator would actually type, about the rows and the problem of THIS turn. ASKED lists everything this thread has already asked or been offered — never repeat one of those, never offer a generic question that would fit any answer. None is better than furniture.`,
    'FACTS were read for you a moment ago. Answer from them first. Use a tool only for a figure or a row you were not handed; one lookup is normal, five is a wander.',
    'The conversation above is what this operator said and what was done about it — including things the cards handled without you, marked [cards only]. "Then", "that one", "tomorrow" refer to it.',
  ].join('\n')) satisfies Producer<AgentDeps>;

// The one block that varies, and it has three values: last among the
// producers, so two turns of the same kind still share everything before it.
const THIS_TURN: Record<RunMode, string> = {
  brief: 'THIS TURN: nobody asked. Something on site was called critical, and a card for it is already up WITH A HEADER THAT STATES THE READING — so do not restate the reading, the percentage or how serious it is; the operator can see all three. Write the ONE sentence the header cannot: how the causes that are STANDING RIGHT NOW compound — which one makes another worse, and where — naming every place involved. FACTS.standing lists all of them, not only the one that tipped it; if two are connected (a gate that feeds a zone, a fault beside a crowd), that connection IS the sentence. If only one cause stands, say what it puts at risk next. Plain words. No adjectives, no "immediate action", no advice, no urgency words. Put it in `response`; name no canvases, fields, steps or follow-ups.',
  ask: 'THIS TURN: the operator asked something, or stated a problem. Answer it in `response`, from FACTS and the conversation; cite each sentence to the card it stands on, placing that card if it is missing; offer follow-ups.',
  write: 'THIS TURN: a form on screen needs words. Write them into the fields under WRITABLE — for the people who will read them, not for the operator — FROM what the other forms in SCREEN currently hold (a move, a hold, a time), not from the sentence alone; and say in `response` what you wrote and for whom.',
  plan: 'THIS TURN: the operator asked what to do. Propose the few steps that RESOLVE the situation: reach first for the forms ([doing]), filled in as far as the pre-decisions allow, and leave out steps that only look something up unless no form applies. Say the plan in one or two sentences in `response`.',
};

const thisTurnIs = (({ deps }) => THIS_TURN[deps.mode]) satisfies Producer<AgentDeps>;

// THE PER-RUN HALF OF THE CONTRACT. The schema above it is static — it has to
// be, the agent is a module — so "an action Jev did not rank", "a row that was
// not offered" and "a field nobody listed" are refused here, by the one
// admission rule, and go back to the model as a correction while its tools are
// still warm. The facts come from the run's own scope (run-facts.ts).
const admitted: OutputValidator<AnswerData> = (output) => {
  // The words are judged with the data: the length bound and the no-recital
  // rule are admission rules like any other, so the model is told and retries.
  const refusals = runFacts.getStore()?.refusals(output.data, output.response ?? '') ?? [];
  return refusals.length === 0 ? { ok: true } : { retry: refusals.join('; ') };
};

export const encoreAgent: AgentDefinition<AnswerData, AgentDeps> = defineAgent<AnswerData, AgentDeps>({
  id: 'encore.agent',
  description: 'The slower mind of the Encore ops room: answers, writes and plans; never acts.',
  instructions: INSTRUCTIONS,
  context: [theRoom, howToAnswer, thisTurnIs],
  // `response` is REQUIRED: it is the answer, and a turn that finishes having
  // said nothing must fail validation rather than reach the card as "Done."
  //
  // NO `strategy`. On Groq's gpt-oss-120b signal resolves `emit` — the envelope
  // on the content channel — because that model stringifies nested arrays in
  // tool arguments (registry: `manglesNestedToolArgs`). Pinning a strategy here
  // would take that resolution away; the tools below stay flat for the same
  // reason.
  output: { schema: AnswerDataSchema, response: 'required', validate: admitted },
  // A typical run is ONE step — the facts are already in the prompt. Six is
  // room for a lookup or two and a correction, not for a wander; somebody is
  // watching a card say "answering".
  stopWhen: [stepCount(6), duration('45s'), outputRetries(2)],
});
