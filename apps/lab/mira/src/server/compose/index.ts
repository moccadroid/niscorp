import { z } from 'zod';
import type { CortexEvent, SignalClient, Usage } from '@niscorp/cortex';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import type { LayoutNode } from '@niscorp/nova';
import type { Upgrader } from '@niscorp/strata';
import { ARRANGEMENTS } from '../../app/arrangements';
import { SCREENS } from '../../app/screens';
import type { Screen } from '../../app/screens';
import type { AreaId } from '../../app/shell/areas';
import { frameLayout } from '../../app/shell/frame.layout';
import { recordModelRun } from '../runs';
import { answerOf, answerSoFar, refusalsOf } from './answer';
import type { AnswerContext } from './answer';
import { CATALOG, opened, screensHeld, withUsable } from './catalog';
import type { Catalog } from './catalog';
import { composerAgent } from './composer.agent';
import { deckOf } from './deck';
import { createHistory, keptAs } from './history';
import { messageInput } from './knowledge';
import { drawnRegion, framed } from './layout';
import { pick } from './pick';
import type { Decide } from './pick';
import { arrangementOfPlan, canvasesInAreas, canvasesOfPlan, inked, planOf } from './plan';
import type { Plan, ShownPlan } from './plan';
import { canvasesStanding, readOpenScreen } from './screen';
import type { OpenCanvas } from './screen';

export type { Decide } from './pick';

export type Jev = { provider: string; model: string; decide: Decide };
export type Chat = { provider: string; model: string; llm: SignalClient; timeoutMs: number };

export type Models = { jev?: Jev; chat?: Chat; missing: readonly string[] };

const AskSchema = z.looseObject({ asked: z.string() });
const OpenSchema = z.looseObject({ opening: z.string() });
const GoSchema = z.looseObject({ going: z.coerce.number() });

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false };

const screenOf = (plan: Plan): string => JSON.stringify([plan.canvases, plan.layout, plan.label]);

export const dockInputs = ({ actions }: { actions: readonly string[] }): Record<string, Record<string, unknown>> => ({
  dock: { screens: screensHeld(actions).map(({ id, label }) => ({ id, label })) },
});

export const composer =
  (models: Models, grammar: Upgrader): ((session: FunctionSession) => FunctionDefinition[]) =>
  (session) => {
    const held = new Set(session.actions);
    const catalog: Catalog = { actions: CATALOG.actions.filter((action) => held.has(action.id)), reads: [], writes: [] };
    let usable: Promise<Catalog> | undefined;
    const screens = screensHeld(session.actions);
    // What the person did last: an answer for anything earlier is no longer shown.
    let turn = 0;

    const screenPlan = (screen: Screen): Plan => planOf('', canvasesInAreas(screen.canvases.map((canvas) => opened(canvas, catalog))), { arrangements: ARRANGEMENTS, screen, arrangement: screen.arrangement, ink: screen.ink });
    const history = createHistory(screenPlan(SCREENS[0]));
    const kept = keptAs(session.wire, grammar);

    // An answer's layout goes into the frame's region through this shell's draft, where moss checks it; it is kept
    // nowhere. The draft holds one frame, taken again for each answer.
    let frameId: string | undefined;
    let drawn = JSON.stringify(framed(frameLayout, 'answers', history.current().layout));
    const draw = async (layout: LayoutNode): Promise<void> => {
      const frame = framed(frameLayout, 'answers', layout);
      const written = JSON.stringify(frame);
      if (written === drawn) return;
      const added = await session.draft.add([{ kind: 'layout', ...(frameId === undefined ? {} : { id: frameId }), body: { ref: 'frame', layout: frame, use: true } }]);
      frameId = added.artifacts[0]?.id;
      drawn = written;
    };
    const show = async (plan: ShownPlan): Promise<ShownPlan> => {
      await draw(drawnRegion(plan));
      return plan;
    };

    // The answer being written, while it streams: the dock re-reads it whenever the message `answer-moved` says it moved.
    let soFar: ShownPlan | undefined;
    const moveTo = (plan: ShownPlan | undefined): void => {
      soFar = plan;
      show(plan ?? history.current())
        .then(() => session.shell.publish('answer-moved'))
        .catch((error: unknown) => console.error(`[ask] the answer so far could not be drawn: ${reasonOf(error)}`));
    };

    // Before anything else is shown, the screen as the person left it is kept with the answer it is on — unless an answer
    // is streaming in over it.
    const standing = (): OpenCanvas[] => {
      const open = readOpenScreen(session.shell, history.current());
      if (soFar === undefined) history.keep(canvasesStanding(open));
      return open;
    };

    const leave = (to: () => ShownPlan): Promise<ShownPlan> => {
      standing();
      turn += 1;
      soFar = undefined;
      return show(to());
    };

    // A screen already in the stack is gone back to, not stacked again. What the model said when it answered with the
    // screen is shown with it, and not kept.
    const showScreen = (screen: Screen, response?: string): ShownPlan => {
      const there = history.indexOf((plan) => plan.screen === screen.id);
      const plan = there >= 0 ? history.go(there + 1) : history.add(screenPlan(screen));
      return response === undefined ? plan : { ...plan, response };
    };

    const ask = async (data: unknown): Promise<ShownPlan> => {
      const message = AskSchema.parse(data).asked.trim();
      if (message === '') return history.current();
      const chat = models.chat;
      if (chat === undefined) throw new Error(`Set ${models.missing.join(' and ')} in .env, and start the app again.`);
      const open = standing();
      const asked = (turn += 1);
      const offered = await (usable ??= withUsable(catalog, session.wire));
      const deps = { catalog: offered, screens, arrangements: ARRANGEMENTS };
      const before = history.current();
      const jev = models.jev;
      const picking = performance.now();
      const picked =
        jev === undefined
          ? undefined
          : await pick(message, open, offered, screens, jev.decide).catch((error: unknown) => {
              console.error(`[ask] Jev could not answer "${message}": ${reasonOf(error)}`);
              return undefined;
            });
      if (jev !== undefined) {
        const usage = picked?.usage ?? NO_USAGE;
        recordModelRun(session, { agentId: 'mira.jev', label: message, provider: jev.provider, model: jev.model, usage, steps: picked === undefined ? 0 : 1, elapsedMs: performance.now() - picking, outcome: picked === undefined ? 'failed' : 'ok' });
      }

      const current = arrangementOfPlan(before);
      const context: AnswerContext = { ...deps, open: canvasesOfPlan(before), current };
      const agent = composerAgent((envelope) => {
        const refused = refusalsOf(envelope.data, context);
        return refused.length === 0 ? { ok: true } : { retry: refused.map((reason) => `- ${reason}`).join('\n') };
      });
      const input = messageInput(message, open, { id: before.arrangement, layout: before.layout }, picked?.picks);
      // A correction starts the answer again from the screen the message was asked on.
      const streamed = (event: CortexEvent): void => {
        if (asked !== turn) return;
        if (event.type === 'retry' && soFar !== undefined) moveTo(undefined);
        if (event.type !== 'output-partial') return;
        const answer = answerSoFar(event.output, context);
        if (answer === undefined) return;
        const plan = history.next(inked(planOf(message, answer.canvases, { arrangements: ARRANGEMENTS, arrangement: answer.arrangement ?? current, label: answer.title, ink: history.nextInk() }), before));
        if (screenOf(plan) === screenOf(soFar ?? before)) return;
        moveTo(plan);
      };
      const result = await agent.run(input, { llm: chat.llm, deps, signal: AbortSignal.timeout(chat.timeoutMs), onEvent: streamed }).result;
      const { usage, steps, elapsedMs } = result.meta;
      recordModelRun(session, { agentId: agent.agentId, label: message, provider: chat.provider, model: chat.model, usage, steps, elapsedMs, outcome: result.ok ? 'ok' : 'failed' });
      if (asked !== turn) return history.current();
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
      const screen = answer.screen === undefined ? undefined : screens.find((candidate) => candidate.id === answer.screen);
      if (screen !== undefined) return show(showScreen(screen, response));
      if (Object.keys(answer.canvases).length === 0) throw new Error('Nothing here answers that yet.');
      const plan = { ...inked(planOf(message, answer.canvases, { arrangements: ARRANGEMENTS, arrangement: answer.arrangement ?? current, label: answer.title, ink: history.nextInk() }), before), response };
      // An answer that leaves the screen as it is adds nothing to the stack; the dock still names what was asked, and why
      // nothing changed.
      if (screenOf({ ...plan, label: before.label }) === screenOf(before)) return show({ ...before, question: message, label: answer.title, response });
      kept.keep(plan).catch((error: unknown) => console.error(`[ask] "${message}" was shown and not kept: ${reasonOf(error)}`));
      return show(history.add(plan));
    };

    const open = async (data: unknown): Promise<ShownPlan> => {
      const screen = screens.find((candidate) => candidate.id === OpenSchema.parse(data).opening);
      return screen === undefined ? history.current() : leave(() => showScreen(screen));
    };

    // The person's answers from before this shell are read once, before anything is shown: the dock asks for the
    // current one as it mounts, which is the last of them.
    let restored: Promise<void> | undefined;
    const restoredFirst =
      <T>(run: (data: unknown) => Promise<T>) =>
      async (data: unknown): Promise<T> => {
        await (restored ??= kept.past().then(history.restore, (error: unknown) => console.error(`[answers] the person's answers could not be read: ${reasonOf(error)}`)));
        return run(data);
      };

    return [
      { id: 'ask', description: 'Answers a message with a screen. Send { asked }; answers the plan shown: { question, response, label, canvases, position, total, stack, ink, next }.', execute: restoredFirst(ask) },
      { id: 'screens.open', description: 'Shows one of the screens in the dock: its canvases together. Send { opening: <screen id> }; answers its plan.', execute: restoredFirst(open) },
      { id: 'answers.back', description: 'Shows the answer before the one shown, and answers its plan.', execute: restoredFirst(async () => leave(history.back)) },
      { id: 'answers.forward', description: 'Shows the answer after the one shown, and answers its plan.', execute: restoredFirst(async () => leave(history.forward)) },
      { id: 'answers.go', description: 'Shows one answer from the stack. Send { going: <its position> }; answers its plan.', execute: restoredFirst(async (data) => leave(() => history.go(GoSchema.parse(data).going))) },
      { id: 'answers.current', description: 'Answers the plan shown, or, while an answer streams, the answer so far.', execute: restoredFirst(async () => soFar ?? show(history.current())) },
      {
        id: 'answers.deck',
        description: 'Every answer in the stack, as the overview draws it: its position and title, what was asked, what the model said it did, and its cards with their titles and words. Send nothing.',
        execute: restoredFirst(async () => deckOf(history.all(), history.current().position)),
      },
    ];
  };
