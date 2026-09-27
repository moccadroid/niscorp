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
import type { TimerWriter, Timing } from '../timing';
import { localNow } from '../timing';
import { vexOver } from '../vex-over';

// THE ASSISTANT'S FUNCTIONS — for what is not data (PLAN.md, "Vex is never
// hidden behind a function"): assembling this person's assistant from what the
// charter granted them, and a model's turn. Saving an automation it proposed
// is still the person's own vex write (`timers/save`), and `timers.arm` loads
// the saved ones into tide.
//
//   assistant.intro  who this assistant is for this person: the declarations
//                    their grants select, and the tools those name
//   assistant.turn   one message in; a reply, the proposals it left, and the
//                    vex queries it opened
//   timers.arm       the saved timers into tide

const DraftSchema = z.object({ draft: z.string() });

// The conversation so far — this person's last turns, oldest first, read as
// them (`turns/mine`, the same rows their screen shows).
const TurnsSchema = z.array(
  z.object({
    message: z.string(),
    reply: z.string(),
    outcome: z.string().nullable(),
    opened: z.array(z.object({ input: z.object({ intent: z.string() }).partial() })),
  }),
);

// The assistant's own conversation — left out of the screen it is shown,
// having it separately. Its tab stays: the tab is on their screen.
const conversationOf = (session: FunctionSession) => (instanceId: string, definitionId: string): boolean =>
  definitionId === 'assistant.thread' && session.shell.getRuntime(instanceId)?.getData()['tab'] !== true;

// What the model is handed about the person — assembled, never authored per
// person: what their grants say about them, what was read AS them, their
// screen as it is now, the actions the charter gave them, and the conversation.
// The one prompt that says how to behave is the orchestrator's.
const knowledgeOf = async (session: FunctionSession, assembled: Assembled, tz: string): Promise<{ knowledge: string; facts: string }> => {
  const vex = vexOver(session.wire);
  const earlier = TurnsSchema.parse(await vex(turnsMine.fingerprint));
  const conversation = earlier
    .map((turn) =>
      [
        `Person: ${turn.message}`,
        ...turn.opened.map((opened) => `(you ran a vex query: ${opened.input.intent ?? ''})`),
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
    return `- ${id} — ${ACTIONS[id]?.title ?? id}.${prefill.length === 0 ? '' : ` Pre-fill: ${prefill.map((entry) => `${entry.key} (${entry.means})`).join('; ')}.`}`;
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
  return { knowledge, facts };
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
    const { knowledge, facts } = await knowledgeOf(session, assembled, deps.tz);
    const proposals: Proposal[] = [];
    const opened: Opened[] = [];
    const tools = hostTools({ session, querier: deps.querier, writer: deps.writer, tz: deps.tz, facts, proposals, opened }, assembled.tools);
    const reply = await deps.orchestrator.answer({ message, knowledge, tools });
    // The turn is a row, written as the person — their conversation, and the
    // next turn's conversation so far.
    const turnId = `turn_${randomBytes(8).toString('hex')}`;
    await vexOver(session.wire)(turnRecord.fingerprint, { turnId, message, reply, proposals, opened });
    return { turnId, text: reply, proposals, opened };
  },
  'timers.arm': async () => ({ armed: await deps.timing().reload() }),
});
