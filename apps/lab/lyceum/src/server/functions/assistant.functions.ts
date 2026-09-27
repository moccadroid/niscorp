import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { describeShell } from '@niscorp/nova/reflect';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { turnRecord, turnsMine } from '@lyceum/app/vex/assistant.entries';
import { assembleFor } from '../assistant/declarations';
import type { Assembled } from '../assistant/declarations';
import { hostTools, offerableActions } from '../assistant/tools';
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
//                    their grants select, its words, its starters
//   assistant.turn   one message in; a reply and the proposals it left
//   timers.arm       the saved timers into tide

const DraftSchema = z.object({ draft: z.string() });

// The conversation so far — this person's last turns, oldest first, read as
// them (`turns/mine`, the same rows their screen shows).
const TurnsSchema = z.array(z.object({ message: z.string(), reply: z.string(), outcome: z.string().nullable() }));

// WHAT IS ON THEIR SCREEN — nova's own reading of the live shell (reflect's
// describeShell): every canvas they have, what is on it, and its data. Not the
// tab bar (buttons, not content), and not the assistant's own bookkeeping —
// its reply, its history, its tab state — which it would otherwise read back.
const NOT_CONTENT = new Set(['tab', 'tabLabel', 'tabInk', 'nextInk', 'strip', 'reply', 'history', 'intro', 'chosen', 'thinking', 'answered', 'saved', 'error', 'draft']);
const screenOf = (session: FunctionSession): string =>
  describeShell(session.shell, {
    only: Object.keys(session.shell.getState().canvases).filter((canvas) => canvas !== 'tabs'),
    collapseOver: 8,
    head: 5,
    clean: (data) => Object.fromEntries(Object.entries(data).filter(([key]) => !NOT_CONTENT.has(key))),
  });

// What the assistant is handed about this person — assembled, not authored:
// their declarations' instructions, the grounding read AS them now, the
// actions they can be offered, and the conversation so far.
const knowledgeOf = async (session: FunctionSession, assembled: Assembled, tz: string): Promise<{ knowledge: string; facts: string }> => {
  const vex = vexOver(session.wire);
  const earlier = TurnsSchema.parse(await vex(turnsMine.fingerprint));
  const conversation = earlier.map((turn) => `Person: ${turn.message}\nYou: ${turn.reply}${turn.outcome === null ? '' : `\n(${turn.outcome})`}`).join('\n');
  const grounded = await Promise.all(
    assembled.from.flatMap((declaration) =>
      declaration.grounding
        .filter((ground) => ground.upfront)
        // A declaration applies only to whoever holds its action, so its reads
        // are theirs to make: one that fails is a bug, and it says so.
        .map(async (ground) => `## ${ground.as}\n${JSON.stringify(await vex(ground.fingerprint, ground.context))}`),
    ),
  );
  const facts = grounded.filter((section) => section !== '').join('\n\n');
  const offerable = offerableActions(session.actions, assembled.tools).map((id) => `- ${id}: ${ACTIONS[id]?.title ?? id}; input ${JSON.stringify(ACTIONS[id]?.input)}`);
  const knowledge = [
    `ASSISTANT FOR THIS PERSON — built from: ${assembled.from.map((declaration) => declaration.id).join(', ') || 'nothing'}`,
    ...assembled.from.map((declaration) => declaration.instructions),
    `Now: ${localNow(Date.now(), tz)} (${tz}).`,
    facts === '' ? '' : `WHAT YOU KNOW\n${facts}`,
    offerable.length === 0 ? '' : `ACTIONS YOU CAN OFFER (with \`open\`)\n${offerable.join('\n')}`,
    `ON THEIR SCREEN (canvas: what is on it, the top one starred — then each one's data)\n${screenOf(session)}`,
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
      intro: assembled.from.map((declaration) => declaration.intro).filter((intro) => intro !== '').join(' '),
      builtFrom: assembled.from.map((declaration) => declaration.id).join(' · '),
      tools: [...assembled.tools].join(' · '),
      starters: assembled.from.flatMap((declaration) => declaration.starters).slice(0, 4),
    };
  },
  'assistant.turn': async (data) => {
    const message = DraftSchema.parse(data).draft.trim();
    if (message === '') throw new Error('Ask something first.');
    const assembled = assembleFor(session.actions);
    const { knowledge, facts } = await knowledgeOf(session, assembled, deps.tz);
    const proposals: Proposal[] = [];
    const opened: Opened[] = [];
    const tools = hostTools({ session, querier: deps.querier, writer: deps.writer, tz: deps.tz, facts, proposals, opened }, assembled.tools);
    const reply = await deps.orchestrator.answer({ message, knowledge, tools });
    // The turn is a row, written as the person — their history, and the next
    // turn's conversation so far.
    const turnId = `turn_${randomBytes(8).toString('hex')}`;
    await vexOver(session.wire)(turnRecord.fingerprint, { turnId, message, reply, proposals });
    return { turnId, text: reply, proposals, opened };
  },
  'timers.arm': async () => ({ armed: await deps.timing().reload() }),
});
