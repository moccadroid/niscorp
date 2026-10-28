import { randomUUID } from 'node:crypto';
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
import { CATALOG, opened, screensHeld } from './catalog';
import type { Catalog } from './catalog';
import { composerAgent } from './composer.agent';
import { deckOf } from './deck';
import { createHistory, keptAs } from './history';
import type { Exchange, History } from './history';
import { transcriptOf } from './knowledge';
import type { ComposerDeps } from './knowledge';
import { drawnAreas, drawnRegion, framed } from './layout';
import { pick } from './pick';
import type { Decide } from './pick';
import { arrangementOfPlan, canvasesInAreas, inked, planOf } from './plan';
import type { Plan, ShownPlan } from './plan';
import { canvasesStanding, drawnCards, readOpenScreen, readSeen } from './screen';
import type { OpenCard } from './screen';

export type { Decide } from './pick';

export type Jev = { provider: string; model: string; decide: Decide };
export type Chat = { provider: string; model: string; llm: SignalClient; timeoutMs: number };

export type Models = { jev?: Jev; chat?: Chat; missing: readonly string[] };

const AskSchema = z.looseObject({ asked: z.string() });
const OpenSchema = z.looseObject({ opening: z.string() });
const GoSchema = z.looseObject({ going: z.coerce.number() });
const CloseSchema = z.looseObject({ closing: z.coerce.number() });

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false };

const screenOf = (plan: Plan): string => JSON.stringify([plan.canvases, plan.layout, plan.label]);

// How many of the person's last messages, with what was said back, the model is given.
const CONVERSATION_GIVEN = 10;

// The conversation, the oldest first. An exchange opens the answer it put up, or the answer it was asked on, while
// either is in the stack; otherwise the screen it was asked on or showed; otherwise nothing.
const conversationOf = (exchanges: readonly Exchange[], history: History): Record<string, unknown>[] =>
  exchanges.map(({ id, question, title, reply, askedOn, screen }) => {
    const at = [id, askedOn].map((answer) => (answer === undefined ? -1 : history.indexOf((plan) => plan.id === answer))).find((index) => index >= 0) ?? -1;
    return { id, question, title, reply, ...(at >= 0 ? { position: at + 1 } : screen !== undefined ? { screen } : {}) };
  });

export const dockInputs = ({ actions }: { actions: readonly string[] }): Record<string, Record<string, unknown>> => ({
  dock: { screens: screensHeld(actions).map(({ id, label }) => ({ id, label })) },
});

export const composer =
  (models: Models, grammar: Upgrader): ((session: FunctionSession) => FunctionDefinition[]) =>
  (session) => {
    const held = new Set(session.actions);
    const catalog: Catalog = { actions: CATALOG.actions.filter((action) => held.has(action.id)) };
    const screens = screensHeld(session.actions);
    // What the person did last: an answer for anything earlier is no longer shown.
    let turn = 0;
    // What the model said back to a message that left the screen as it was stays in the dock until the person asks again
    // or moves along the stack.
    let said: string | undefined;
    const withSaid = (plan: ShownPlan): ShownPlan => (said === undefined ? plan : { ...plan, said });

    const screenPlan = (screen: Screen): Plan => planOf('', canvasesInAreas(screen.canvases.map((canvas) => opened(canvas, catalog))), { arrangements: ARRANGEMENTS, screen, arrangement: screen.arrangement, ink: screen.ink });
    const history = createHistory(screenPlan(SCREENS[0]));
    const kept = keptAs(session.wire, grammar);
    // Every message the person sent and what was said back, the oldest first: the model is given the last of them, and
    // the conversation lists them all.
    const exchanges: Exchange[] = [];
    const remember = (exchange: Exchange, keeping: Promise<void>): void => {
      exchanges.push(exchange);
      keeping.catch((error: unknown) => console.error(`[ask] "${exchange.question}" was answered and not kept: ${reasonOf(error)}`));
    };

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
    // is streaming in over it — and its cards as they were drawn are kept on the answer's row, for the overview.
    const standing = (): OpenCard[] => {
      const left = history.current();
      const drawn = drawnCards(session.shell);
      const open = readOpenScreen(session.shell, left, drawn);
      if (soFar !== undefined) return open;
      history.keep(canvasesStanding(open), drawn);
      if (left.id !== undefined && JSON.stringify(drawn) !== JSON.stringify(left.drawn ?? {})) {
        kept.drawn(left.id, drawn).catch((error: unknown) => console.error(`[answers] how "${left.label}" was drawn was not kept: ${reasonOf(error)}`));
      }
      return open;
    };

    const leave = (to: () => ShownPlan): Promise<ShownPlan> => {
      standing();
      turn += 1;
      said = undefined;
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
      const standingOpen = standing();
      const asked = (turn += 1);
      said = undefined;
      const before = history.current();
      // The first screen welcomes; an answer asked on it starts from an empty screen, and none of its cards stay.
      const welcome = before.screen === SCREENS[0].id;
      const from: Plan = welcome ? { ...before, canvases: {}, inks: {}, marks: {} } : before;
      const open = welcome ? [] : standingOpen;
      const jev = models.jev;
      const picking = performance.now();
      const picked =
        jev === undefined
          ? undefined
          : await pick(message, open, catalog, screens, jev.decide).catch((error: unknown) => {
              console.error(`[ask] Jev could not answer "${message}": ${reasonOf(error)}`);
              return undefined;
            });
      if (jev !== undefined) {
        const usage = picked?.usage ?? NO_USAGE;
        recordModelRun(session, { agentId: 'mira.jev', label: message, provider: jev.provider, model: jev.model, usage, steps: picked === undefined ? 0 : 1, elapsedMs: performance.now() - picking, outcome: picked === undefined ? 'failed' : 'ok' });
      }

      const current = arrangementOfPlan(before);
      const columns = drawnAreas(before).columns;
      const deps: ComposerDeps = { catalog, screens, roles: session.roles, seen: readSeen(session.shell, standingOpen, columns), ...(picked === undefined ? {} : { picks: picked.picks }) };
      const context: AnswerContext = { ...deps, open, columns };
      const agent = composerAgent((envelope) => {
        const refused = refusalsOf(envelope.data, context);
        return refused.length === 0 ? { ok: true } : { retry: refused.map((reason) => `- ${reason}`).join('\n') };
      });
      const input = transcriptOf(exchanges.slice(-CONVERSATION_GIVEN), message);
      // A correction starts the answer again from the screen the message was asked on.
      const streamed = (event: CortexEvent): void => {
        if (asked !== turn) return;
        if (event.type === 'retry' && soFar !== undefined) moveTo(undefined);
        if (event.type !== 'output-partial') return;
        const answer = answerSoFar(event.output, context);
        if (answer === undefined || Object.keys(answer.canvases).length === 0) return;
        const plan = history.next(inked(planOf(message, answer.canvases, { arrangements: ARRANGEMENTS, arrangement: answer.layout ?? current, label: answer.title, ink: history.nextInk() }), from));
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
      if (screen !== undefined) {
        const exchange = { id: randomUUID(), question: message, title: answer.title === '' ? screen.label : answer.title, reply: response, screen: screen.id };
        remember(exchange, kept.keepSaid(exchange));
        return show({ ...showScreen(screen, response), question: message });
      }
      const nothingPlaced = Object.keys(answer.canvases).length === 0;
      if (nothingPlaced && !welcome) throw new Error('Nothing here answers that yet.');
      const id = randomUUID();
      const plan = { ...inked(planOf(message, answer.canvases, { arrangements: ARRANGEMENTS, arrangement: answer.layout ?? current, label: answer.title, ink: history.nextInk() }), from), response, id };
      // An answer that leaves the screen as it is adds nothing to the stack; the dock still names what was asked, and says
      // what the model said back, the one place it is said.
      if (nothingPlaced || screenOf({ ...plan, label: before.label }) === screenOf(before)) {
        const exchange = { id, question: message, title: answer.title, reply: response, ...(before.id === undefined ? {} : { askedOn: before.id }), ...(before.screen === undefined ? {} : { screen: before.screen }) };
        remember(exchange, kept.keepSaid(exchange));
        said = response;
        return show(withSaid({ ...before, question: message, label: answer.title, response }));
      }
      remember({ id, question: message, title: answer.title, reply: response }, kept.keep(plan));
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
        await (restored ??= Promise.all([
          kept.past().then(history.restore),
          kept.said().then((past) => {
            exchanges.unshift(...past);
          }),
        ]).then(
          () => undefined,
          (error: unknown) => console.error(`[answers] the person's answers could not be read: ${reasonOf(error)}`),
        ));
        return run(data);
      };

    return [
      { id: 'ask', description: 'Answers a message with a screen. Send { asked }; answers the plan shown: { question, response, label, canvases, position, total, stack, ink, next }.', execute: restoredFirst(ask) },
      { id: 'screens.open', description: 'Shows one of the screens in the dock: its canvases together. Send { opening: <screen id> }; answers its plan.', execute: restoredFirst(open) },
      { id: 'answers.back', description: 'Shows the answer before the one shown, and answers its plan.', execute: restoredFirst(async () => leave(history.back)) },
      { id: 'answers.forward', description: 'Shows the answer after the one shown, and answers its plan.', execute: restoredFirst(async () => leave(history.forward)) },
      { id: 'answers.go', description: 'Shows one answer from the stack. Send { going: <its position> }; answers its plan.', execute: restoredFirst(async (data) => leave(() => history.go(GoSchema.parse(data).going))) },
      { id: 'answers.current', description: 'Answers the plan shown, or, while an answer streams, the answer so far.', execute: restoredFirst(async () => soFar ?? show(withSaid(history.current()))) },
      {
        id: 'answers.deck',
        description: 'Every answer in the stack, as the overview draws it: its position and title, what was asked, what the model said it did, and its cards with their titles and words. Send nothing.',
        execute: restoredFirst(async () => deckOf(history.all(), history.current().position, drawnCards(session.shell))),
      },
      {
        id: 'answers.close',
        description: 'Closes one answer in the stack: it leaves the stack, and stays in the conversation; the first screen stays. Send { closing: <its position> }; answers the overview again.',
        execute: restoredFirst(async (data) => {
          const position = CloseSchema.parse(data).closing;
          if (position === history.current().position) {
            standing();
            turn += 1;
            soFar = undefined;
            said = undefined;
          }
          const closed = history.close(position);
          if (closed?.id !== undefined) kept.close(closed.id).catch((error: unknown) => console.error(`[answers] "${closed.label}" was closed and not kept closed: ${reasonOf(error)}`));
          if (closed !== undefined) await show(history.current());
          // The page is not drawn again yet: the answer now shown is drawn as it was kept.
          return deckOf(history.all(), history.current().position, history.current().drawn ?? {});
        }),
      },
      {
        id: 'answers.conversation',
        description:
          'Everything the person asked and what was said back, the oldest first, each with what it opens: the position of its answer in the stack, or a screen. Send nothing.',
        execute: restoredFirst(async () => conversationOf(exchanges, history)),
      },
    ];
  };
