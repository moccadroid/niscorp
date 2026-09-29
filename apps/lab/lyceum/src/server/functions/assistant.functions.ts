import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { turnRecord, turnsMine } from '@lyceum/app/vex/assistant.entries';
import { screenText } from '@lyceum/ui/text.kit';
import { assembleFor } from '../assistant/declarations';
import type { Assembled } from '../assistant/declarations';
import { hostTools, offerableActions, prefillOf } from '../assistant/tools';
import type { Opened, Proposal } from '../assistant/tools';
import type { Orchestrator } from '../assistant/orchestrator';
import type { Querier } from '../querying';
import type { TimerRequest, TimerWriter, Timing, Written } from '../timing';
import { answerSchemaOf, isDraft } from '@niscorp/tide/agent';
import { anchorTimer, DRAFT_HERE, dueOf, localNow, proposable, slideIdsOf } from '../timing';
import { slidesDeck } from '@lyceum/app/vex/deck.entries';
import { timerSave } from '@lyceum/app/vex/timer.entries';
import { vexOver } from '../vex-over';

// THE ASSISTANT'S FUNCTIONS — for what is not data (PLAN.md, "Vex is never
// hidden behind a function"): assembling this person's assistant from what the
// charter granted them, and a model's turn; and saving an automation it
// proposed, which needs the one thing that cannot be data — the clock at the
// press — and is otherwise the person's own vex write (`timers/save`), as them.
//
//   assistant.intro  who this assistant is for this person: the declarations
//                    their grants select, and the tools those name
//   assistant.turn   one message in; a reply, the proposals it left, and the
//                    vex queries it opened
//   timers.save      the chosen draft anchored at the press, written as the
//                    person, and the saved timers loaded into tide

const DraftSchema = z.object({ draft: z.string() });
// The proposal the person pressed Save on (`chosen`, set by the press).
const ChosenSchema = z.object({ chosen: z.object({ timerId: z.string().min(1), draft: z.unknown() }) });

// The conversation so far — this person's last turns, oldest first, read as
// them (`turns/mine`, the same rows their screen shows).
const TurnsSchema = z.array(
  z.object({
    message: z.string(),
    reply: z.string(),
    outcome: z.string().nullable(),
    opened: z.array(z.object({ label: z.string() })),
    writer_answer: z.unknown(),
    writer_reasoning: z.string().nullable(),
  }),
);

// THIS AUTOMATION SO FAR: the newest turns in which the automation writer
// answered — a question, a refusal, or a draft the person has not saved —
// oldest first, each with the person's words, the answer and its reasoning.
// A turn it did not answer in ends it, and so does a saved draft: that one is
// done. An unanswered question or an unsaved draft is just a past turn —
// nothing is waiting on it; it is only there if the next words take it up.
const AnswerHereSchema = answerSchemaOf(DRAFT_HERE);
const earlierOf = (turns: z.infer<typeof TurnsSchema>): TimerRequest['earlier'] => {
  const newestFirst = [...turns].reverse().map((turn) => ({ turn, answer: AnswerHereSchema.safeParse(turn.writer_answer).data }));
  const end = newestFirst.findIndex(({ turn, answer }) => answer === undefined || (isDraft(answer) && turn.outcome !== null));
  return newestFirst
    .slice(0, end === -1 ? undefined : end)
    .reverse()
    .flatMap(({ turn, answer }) => (answer === undefined ? [] : [{ request: turn.message, answer, reasoning: turn.writer_reasoning ?? undefined }]));
};

// The assistant's own conversation — left out of the screen it is shown,
// having it separately. Its tab stays: the tab is on their screen.
const conversationOf = (session: FunctionSession) => (instanceId: string, definitionId: string): boolean =>
  definitionId === 'assistant.thread' && session.shell.getRuntime(instanceId)?.getData()['tab'] !== true;

// What the model is handed about the person — assembled, never authored per
// person: what their grants say about them, what was read AS them, their
// screen as it is now, the actions the charter gave them, and the conversation.
// The one prompt that says how to behave is the orchestrator's.
const knowledgeOf = async (session: FunctionSession, assembled: Assembled, tz: string): Promise<{ knowledge: string; facts: string; earlier: TimerRequest['earlier'] }> => {
  const vex = vexOver(session.wire);
  const earlier = TurnsSchema.parse(await vex(turnsMine.fingerprint));
  const conversation = earlier
    .map((turn) =>
      [
        `Person: ${turn.message}`,
        ...turn.opened.map((opened) => `(you opened on their screen: ${opened.label})`),
        `You: ${turn.reply}`,
        ...(turn.outcome === null ? [] : [`(${turn.outcome})`]),
      ].join('\n'),
    )
    .join('\n\n');
  const grounded = await Promise.all(
    assembled.from.flatMap((declaration) =>
      declaration.grounding
        .filter((ground) => ground.upfront)
        // A declaration applies only to whoever holds its action, so its reads
        // are theirs to make: one that fails is a bug, and it says so.
        .map(async (ground) => `${ground.as}: ${JSON.stringify(await vex(ground.fingerprint, ground.context))}`),
    ),
  );
  const facts = grounded.join('\n');
  const actions = offerableActions(session.actions).map((id) => {
    const prefill = prefillOf(id);
    const action = ACTIONS[id];
    return `- ${id} — ${action?.title ?? id}: ${action?.description ?? ''}${prefill.length === 0 ? '' : ` Pre-fill: ${prefill.map((entry) => `${entry.key} (${entry.description})`).join('; ')}.`}`;
  });
  const knowledge = [
    `THE PERSON\n${[...assembled.from.map((declaration) => declaration.context), facts].filter((line) => line !== '').join('\n')}`,
    `NOW\n${localNow(Date.now(), tz)} (${tz})`,
    `ON THEIR SCREEN — what it shows right now, as text; this conversation left out\n${screenText(session.shell, conversationOf(session))}`,
    actions.length === 0 ? '' : `THEIR ACTIONS — what the charter gives them${assembled.tools.has('open') ? '; `open` can offer any of these' : ''}\n${actions.join('\n')}`,
    conversation === '' ? '' : `THE CONVERSATION SO FAR\n${conversation}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
  return { knowledge, facts, earlier: earlierOf(earlier) };
};

export const assistantFunctions = (
  session: FunctionSession,
  deps: { querier: Querier; writer: TimerWriter; orchestrator: Orchestrator; tz: string; timing: () => Timing },
): Record<string, FunctionHandler> => ({
  'assistant.intro': async () => {
    const assembled = assembleFor(session.actions);
    const main = assembled.from[assembled.from.length - 1];
    return {
      title: main?.title ?? 'Assistant',
      builtFrom: assembled.from.map((declaration) => declaration.id).join(' · '),
      tools: [...assembled.tools].join(' · '),
    };
  },
  'assistant.turn': async (data) => {
    const message = DraftSchema.parse(data).draft.trim();
    if (message === '') throw new Error('Write something first.');
    const assembled = assembleFor(session.actions);
    const { knowledge, facts, earlier } = await knowledgeOf(session, assembled, deps.tz);
    const proposals: Proposal[] = [];
    const opened: Opened[] = [];
    const wrote: Written[] = [];
    const tools = hostTools({ session, querier: deps.querier, writer: deps.writer, tz: deps.tz, facts, proposals, opened, earlier, wrote }, assembled.tools);
    const reply = await deps.orchestrator.answer({ message, knowledge, tools });
    // The turn is a row, written as the person — their conversation, and the
    // next turn's conversation so far.
    const turnId = `turn_${randomBytes(8).toString('hex')}`;
    await vexOver(session.wire)(turnRecord.fingerprint, { turnId, message, reply, proposals, opened, writerAnswer: wrote.at(-1)?.answer ?? null, writerReasoning: wrote.at(-1)?.reasoning ?? null });
    return { turnId, text: reply, proposals, opened };
  },
  'timers.save': async (data) => {
    const { chosen } = ChosenSchema.parse(data);
    const slideIds = slideIdsOf(await vexOver(session.wire)(slidesDeck.fingerprint));
    const reflex = anchorTimer(proposable(chosen.draft, slideIds), chosen.timerId, Date.now(), deps.tz, slideIds);
    const due = dueOf(reflex, Date.now());
    await vexOver(session.wire)(timerSave.fingerprint, {
      timerId: chosen.timerId,
      reflex,
      intent: reflex.intent,
      dueAt: due === undefined ? null : new Date(due).toISOString(),
    });
    await deps.timing().reload();
    return { dueLocal: due === undefined ? '' : localNow(due, deps.tz, true).slice(11) };
  },
});
