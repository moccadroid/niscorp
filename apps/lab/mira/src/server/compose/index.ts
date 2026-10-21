import { z } from 'zod';
import type { CortexEvent, SignalClient, Usage } from '@niscorp/cortex';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { unverifiedShell } from '@niscorp/moss/unverified';
import { ARRANGEMENTS } from '../../app/arrangements';
import { SCREENS } from '../../app/screens';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { recordModelRun } from '../runs';
import { answerOf, answerSoFar, refusalsOf } from './answer';
import type { Answer, AnswerContext } from './answer';
import { CATALOG, opened } from './catalog';
import type { Catalog } from './catalog';
import { composerAgent } from './composer.agent';
import { createHistory } from './history';
import { messageInput } from './knowledge';
import { markChanged } from './layout';
import { pick } from './pick';
import type { Decide } from './pick';
import { arrangementOfPlan, canvasesInAreas, canvasesOfPlan, changedAreas, planOf, wordsCanvas } from './plan';
import type { AreaCanvases, Plan, ShownPlan } from './plan';
import { canvasesStanding, readOpenScreen } from './screen';
import type { OpenCanvas } from './screen';

export type { Decide } from './pick';
export type { ShownPlan } from './plan';

// Who runs a model is said in every run it is recorded in.
export type Jev = { provider: string; model: string; decide: Decide };
export type Chat = { provider: string; model: string; llm: SignalClient; timeoutMs: number };

export type Models = { jev?: Jev; chat?: Chat; missing: readonly string[] };

const AskSchema = z.looseObject({ text: z.string() });
const OpenSchema = z.looseObject({ opening: z.string() });
const GoSchema = z.looseObject({ going: z.coerce.number() });

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false };

const canvasesOfAnswer = (answer: Answer): AreaCanvases => {
  const canvases: AreaCanvases = { ...answer.canvases };
  for (const area of AREAS) {
    const said = answer.said[area];
    if (said !== undefined) canvases[area] = wordsCanvas(said);
  }
  return canvases;
};

const screenOf = (plan: Plan): string => JSON.stringify([plan.canvases, plan.layout]);

export const composer =
  (models: Models): ((session: FunctionSession) => FunctionDefinition[]) =>
  (session) => {
    const held = new Set(session.actions);
    const catalog: Catalog = { ...CATALOG, actions: CATALOG.actions.filter((action) => held.has(action.id)) };
    const deps = { catalog, screens: SCREENS, arrangements: ARRANGEMENTS };
    let asked = 0;

    const home = SCREENS[0];
    const screenPlan = (screen: Screen): Plan => planOf('', canvasesInAreas(screen.canvases.map((canvas) => opened(canvas, catalog))), { arrangements: ARRANGEMENTS, screen, arrangement: screen.arrangement });
    const history = createHistory(home === undefined ? undefined : screenPlan(home));

    // The swap goes around moss (`unverifiedShell`): moss lets a session change a layout only through a draft, and a
    // draft needs a signed-in person. When the app has sign-in, this moves to `session.draft`, where moss checks it.
    const show = (plan: ShownPlan, changed: readonly AreaId[] = []): ShownPlan => {
      unverifiedShell(session).setLayout('answers', changed.length > 0 ? markChanged(plan.layout, changed) : plan.layout);
      return plan;
    };

    // The answer being written, while it streams: the dock re-reads it whenever the message `answer-moved` says it moved.
    let soFar: ShownPlan | undefined;
    const moveTo = (plan: ShownPlan | undefined, changed: readonly AreaId[] = []): void => {
      soFar = plan;
      show(plan ?? history.current(), changed);
      session.shell.publish('answer-moved');
    };

    // Before anything else is shown, the screen as the person left it is kept with the answer it is on.
    const standing = (): OpenCanvas[] => {
      const open = readOpenScreen(session.shell, history.current());
      history.keep(canvasesStanding(open));
      return open;
    };

    // A screen already in the stack is gone back to, not stacked again. What the model said when it answered with the
    // screen is shown with it, and not kept.
    const showScreen = (screen: Screen, response?: string): ShownPlan => {
      const there = history.indexOf((plan) => plan.screen === screen.id);
      const plan = there >= 0 ? history.go(there + 1) : history.add(screenPlan(screen));
      return show(response === undefined ? plan : { ...plan, response });
    };

    // A message that gets no screen leaves the screen as it is: what went wrong is said under the line it was typed in.
    const ask = async (data: unknown): Promise<ShownPlan> => {
      const message = AskSchema.parse(data).text.trim();
      if (message === '') return history.current();
      const chat = models.chat;
      if (chat === undefined) throw new Error(`Set ${models.missing.join(' and ')} in .env, and start the app again.`);
      const turn = (asked += 1);
      const open = standing();
      const before = history.current();
      const jev = models.jev;
      const picking = performance.now();
      const picked =
        jev === undefined
          ? undefined
          : await pick(message, open, catalog, SCREENS, jev.decide).catch((error: unknown) => {
              console.error(`[ask] Jev could not answer "${message}": ${reasonOf(error)}`);
              return undefined;
            });
      if (jev !== undefined) {
        const usage = picked?.usage ?? NO_USAGE;
        recordModelRun(session, { agentId: 'mira.jev', label: message, provider: jev.provider, model: jev.model, usage, steps: picked === undefined ? 0 : 1, elapsedMs: performance.now() - picking, outcome: picked === undefined ? 'failed' : 'ok' });
      }

      // An answer that does not hold is corrected inside the run, with what is wrong with it.
      const current = arrangementOfPlan(before);
      const context: AnswerContext = { open: canvasesOfPlan(before), current, catalog, screens: SCREENS, arrangements: ARRANGEMENTS };
      const agent = composerAgent((envelope) => {
        const refused = refusalsOf(envelope.data, context);
        return refused.length === 0 ? { ok: true } : { retry: refused.map((reason) => `- ${reason}`).join('\n') };
      });
      const input = messageInput(message, open, { id: before.arrangement, layout: before.layout }, picked?.picks);
      // A correction starts the answer again from the screen the message was asked on.
      const streamed = (event: CortexEvent): void => {
        if (turn !== asked) return;
        if (event.type === 'retry' && soFar !== undefined) moveTo(undefined);
        if (event.type !== 'output-partial') return;
        const answer = answerSoFar(event.output, context);
        if (answer === undefined) return;
        const plan = history.next(planOf(message, canvasesOfAnswer(answer), { arrangements: ARRANGEMENTS, arrangement: answer.arrangement ?? current, label: answer.title }));
        if (JSON.stringify([screenOf(plan), plan.label]) === JSON.stringify([screenOf(soFar ?? before), (soFar ?? before).label])) return;
        moveTo(plan, changedAreas(plan, before));
      };
      const result = await agent.run(input, { llm: chat.llm, deps, signal: AbortSignal.timeout(chat.timeoutMs), onEvent: streamed }).result;
      const { usage, steps, elapsedMs } = result.meta;
      recordModelRun(session, { agentId: 'mira.compose', label: message, provider: chat.provider, model: chat.model, usage, steps, elapsedMs, outcome: result.ok ? 'ok' : 'failed' });
      // A later message is being answered: this one's answer would only flash past.
      if (turn !== asked) return history.current();
      const placed = soFar !== undefined;
      soFar = undefined;

      if (!result.ok) {
        const { code, stop, message: reason } = result.error;
        console.error(`[ask] "${message}" got no screen: ${code}${stop === undefined ? '' : ` (${stop})`}: ${reason}`);
        if (placed) moveTo(undefined);
        throw new Error(code === 'aborted' || code === 'model_call_failed' ? 'The model could not be reached. Ask again in a moment.' : 'That answer did not fit this app’s actions. Ask again, or put it differently.');
      }
      const answer = answerOf(result.output.data, context);
      const response = result.output.response?.trim() ?? '';
      const screen = answer.screen === undefined ? undefined : SCREENS.find((candidate) => candidate.id === answer.screen);
      if (screen !== undefined) return showScreen(screen, response);
      const canvases = canvasesOfAnswer(answer);
      if (Object.keys(canvases).length === 0) throw new Error('Nothing here answers that yet.');
      const plan = { ...planOf(message, canvases, { arrangements: ARRANGEMENTS, arrangement: answer.arrangement ?? current, label: answer.title }), response };
      // An answer that leaves the screen as it is adds nothing to the stack; the dock still names what was asked, and why
      // nothing changed.
      if (screenOf(plan) === screenOf(before)) return show({ ...before, question: message, label: answer.title, response });
      return show(history.add(plan), changedAreas(plan, before));
    };

    const open = async (data: unknown): Promise<ShownPlan> => {
      const screen = SCREENS.find((candidate) => candidate.id === OpenSchema.parse(data).opening);
      if (screen === undefined) return history.current();
      standing();
      return showScreen(screen);
    };

    const leave = (to: () => ShownPlan): ShownPlan => {
      standing();
      return show(to());
    };

    return [
      { id: 'ask', description: 'Answers a message with a screen. Send { text }; answers the plan shown: { question, response, label, canvases, position, total, stack }.', execute: ask },
      { id: 'screens.open', description: 'Shows one of the screens in the dock: its canvases together. Send { opening: <screen id> }; answers its plan.', execute: open },
      { id: 'answers.back', description: 'Shows the answer before the one shown, and answers its plan.', execute: async () => leave(history.back) },
      { id: 'answers.forward', description: 'Shows the answer after the one shown, and answers its plan.', execute: async () => leave(history.forward) },
      { id: 'answers.go', description: 'Shows one answer from the stack. Send { going: <its position> }; answers its plan.', execute: async (data) => leave(() => history.go(GoSchema.parse(data).going)) },
      { id: 'answers.current', description: 'Answers the plan shown, or, while an answer streams, the answer so far.', execute: async () => soFar ?? history.current() },
    ];
  };
