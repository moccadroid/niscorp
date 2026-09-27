import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { assembleFor } from '../assistant/declarations';
import type { Assembled } from '../assistant/declarations';
import { hostTools } from '../assistant/tools';
import type { Proposal } from '../assistant/tools';
import type { Orchestrator } from '../assistant/orchestrator';
import type { Asker } from '../asking';
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

// What the assistant is handed about this person — assembled, not authored:
// their declarations' instructions, the grounding read AS them now, and the
// actions they can be offered.
const knowledgeOf = async (session: FunctionSession, assembled: Assembled, tz: string): Promise<{ knowledge: string; facts: string }> => {
  const vex = vexOver(session.wire);
  const grounded = await Promise.all(
    assembled.from.flatMap((declaration) =>
      declaration.grounding
        .filter((ground) => ground.upfront)
        .map(async (ground) => {
          try {
            return `## ${ground.as}\n${JSON.stringify(await vex(ground.fingerprint, ground.context))}`;
          } catch {
            // A read this person's policy refuses contributes nothing.
            return '';
          }
        }),
    ),
  );
  const facts = grounded.filter((section) => section !== '').join('\n\n');
  const offerable = session.actions
    .filter((id) => ACTIONS[id]?.input !== undefined)
    .map((id) => `- ${id}: ${ACTIONS[id]?.title ?? id}; input ${JSON.stringify(ACTIONS[id]?.input)}`);
  const knowledge = [
    `ASSISTANT FOR THIS PERSON — built from: ${assembled.from.map((declaration) => declaration.id).join(', ') || 'nothing'}`,
    ...assembled.from.map((declaration) => declaration.instructions),
    `Now: ${localNow(Date.now(), tz)} (${tz}).`,
    facts === '' ? '' : `WHAT YOU KNOW\n${facts}`,
    offerable.length === 0 ? '' : `ACTIONS YOU CAN OFFER (with \`open\`)\n${offerable.join('\n')}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
  return { knowledge, facts };
};

export const assistantFunctions = (
  session: FunctionSession,
  deps: { asker: Asker; writer: TimerWriter; orchestrator: Orchestrator; tz: string; timing: () => Timing },
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
    const tools = hostTools({ session, asker: deps.asker, writer: deps.writer, tz: deps.tz, facts, proposals }, assembled.tools);
    const reply = await deps.orchestrator.answer({ message, knowledge, tools });
    return { text: reply, proposals };
  },
  'timers.arm': async () => ({ armed: await deps.timing().reload() }),
});
