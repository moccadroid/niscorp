import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { unverifiedShell } from '@niscorp/moss/unverified';
import { ARRANGEMENTS } from '../../app/arrangements';
import type { Arrangement } from '../../app/arrangements';
import { SCREENS } from '../../app/screens';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { recordModelRun } from '../runs';
import type { Usage } from '../runs';
import { composeAnswer } from './answer';
import type { Compose } from './answer';
import { CATALOG } from './catalog';
import type { Catalog } from './catalog';
import { createHistory } from './history';
import { markChanged } from './layout';
import { pick } from './pick';
import type { Decide } from './pick';
import { arrangementOfPlan, canvasesInAreas, canvasesOfPlan, changedAreas, planOf, wordsCanvas } from './plan';
import type { AreaCanvases, Plan, ShownPlan } from './plan';
import { messagePrompt, systemPrompt } from './prompt';
import { readOpenScreen } from './screen';

export type { Compose } from './answer';
export type { Decide, Picked, Question } from './pick';
export type { ShownPlan } from './plan';

export type Embed = (texts: string[]) => Promise<number[][]>;

// Who runs a model is said in every run it is recorded in.
export type Model<F> = { provider: string; model: string; call: F };

export type Models = { decide?: Model<Decide>; compose?: Model<Compose>; embed?: Embed; missing: readonly string[] };

const AskSchema = z.looseObject({ text: z.string() });
const OpenSchema = z.looseObject({ opening: z.string() });
const SavedSchema = z.looseObject({ saved: z.string() });
const GoSchema = z.looseObject({ going: z.coerce.number() });
const WriteSchema = z.looseObject({ write: z.string(), fields: z.array(z.looseObject({ key: z.string(), value: z.unknown() })) });

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const composer =
  (models: Models, catalog: Catalog = CATALOG, screens: readonly Screen[] = SCREENS, arrangements: readonly Arrangement[] = ARRANGEMENTS) =>
  (session: FunctionSession): FunctionDefinition[] => {
    const writes = new Set(catalog.writes.map((write) => write.fingerprint));
    const system = systemPrompt(catalog, screens, arrangements);
    let asked = 0;

    const record = (agentId: string, model: Model<unknown>, label: string, usage: readonly Usage[], since: number, ok: boolean): void =>
      recordModelRun(session, { agentId, label, provider: model.provider, model: model.model, usage, elapsedMs: performance.now() - since, outcome: ok ? 'ok' : 'failed' });

    const home = screens[0];
    const screenPlan = (screen: Screen): Plan => planOf('', canvasesInAreas(screen.canvases), { arrangements, screen, arrangement: screen.arrangement });
    const history = createHistory(home === undefined ? undefined : screenPlan(home));

    // The swap goes around moss (`unverifiedShell`): moss lets a session change a layout only through a draft, and a
    // draft needs a signed-in person. When the app has sign-in, this moves to `session.draft`, where moss checks it.
    const show = (plan: ShownPlan, changed: readonly AreaId[] = []): ShownPlan => {
      unverifiedShell(session).setLayout('answers', changed.length > 0 ? markChanged(plan.layout, changed) : plan.layout);
      session.shell.publish('answer', plan);
      return plan;
    };

    // A screen already in the stack is gone back to, not stacked again. What the model said when it answered with the
    // screen is shown with it, and not kept.
    const showScreen = (screen: Screen, reasoning?: string): ShownPlan => {
      const there = history.indexOf((plan) => plan.screen === screen.id);
      const plan = there >= 0 ? history.go(there + 1) : history.add(screenPlan(screen));
      return show(reasoning === undefined ? plan : { ...plan, reasoning });
    };

    // A message that gets no screen leaves the screen as it is: what went wrong is said under the line it was typed in.
    const ask = async (data: unknown): Promise<ShownPlan> => {
      const message = AskSchema.parse(data).text.trim();
      if (message === '') return history.current();
      const before = history.current();
      const chat = models.compose;
      if (chat === undefined) throw new Error(`Set ${models.missing.join(' and ')} in .env, and start the app again.`);
      const turn = (asked += 1);
      const open = readOpenScreen(session.shell, before);
      const jev = models.decide;
      const picking = performance.now();
      const picked =
        jev === undefined
          ? undefined
          : await pick(message, open, catalog, screens, jev.call).catch((error: unknown) => {
              console.error(`[ask] Jev could not answer "${message}": ${reasonOf(error)}`);
              return undefined;
            });
      if (jev !== undefined) record('mira.jev', jev, message, picked === undefined ? [] : [picked.usage], picking, picked !== undefined);
      const composing = performance.now();
      const current = arrangementOfPlan(before);
      const user = messagePrompt(message, open, { id: before.arrangement, layout: before.layout }, picked?.picks);
      const composed = await composeAnswer({ system, user }, { open: canvasesOfPlan(before), current, catalog, screens, arrangements }, chat.call).catch((error: unknown) => {
        console.error(`[ask] the model could not answer "${message}": ${reasonOf(error)}`);
        return undefined;
      });
      record('mira.compose', chat, message, composed?.usage ?? [], composing, composed !== undefined && 'answer' in composed);
      // A later message is being answered: this one's answer would only flash past.
      if (turn !== asked) return history.current();

      if (composed === undefined) throw new Error('The model could not be reached. Ask again in a moment.');
      if ('refused' in composed) {
        console.error(`[ask] "${message}" was answered twice with what this app cannot show: ${composed.refused.join(' | ')}`);
        throw new Error('That answer did not fit this app’s actions. Ask again, or put it differently.');
      }
      const { answer } = composed;
      const screen = answer.screen === undefined ? undefined : screens.find((candidate) => candidate.id === answer.screen);
      if (screen !== undefined) return showScreen(screen, answer.reasoning);
      const canvases: AreaCanvases = { ...answer.canvases };
      for (const area of AREAS) {
        const said = answer.said[area];
        if (said !== undefined) canvases[area] = wordsCanvas(said);
      }
      if (Object.keys(canvases).length === 0) throw new Error('Nothing here answers that yet.');
      const plan = { ...planOf(message, canvases, { arrangements, arrangement: answer.arrangement ?? current, label: answer.title }), reasoning: answer.reasoning };
      // An answer that leaves the screen as it is adds nothing to the stack; the dock still names what was asked, and why
      // nothing changed.
      if (JSON.stringify([plan.canvases, plan.layout]) === JSON.stringify([before.canvases, before.layout])) return show({ ...before, question: message, label: answer.title, reasoning: answer.reasoning });
      return show(history.add(plan), changedAreas(plan, before));
    };

    const open = async (data: unknown): Promise<ShownPlan> => {
      const screen = screens.find((candidate) => candidate.id === OpenSchema.parse(data).opening);
      return screen === undefined ? history.current() : showScreen(screen);
    };

    // A form an answer opened has done its work once saved, and goes; the rest stays where it is. On a screen it stays,
    // emptied, for the next one. An answer left with nothing leaves the stack, and the first screen is gone back to.
    const saved = async (data: unknown): Promise<ShownPlan> => {
      const fingerprint = SavedSchema.parse(data).saved;
      const now = history.current();
      if (now.screen !== undefined) return now;
      const kept = Object.fromEntries(Object.entries(canvasesOfPlan(now)).filter(([, canvas]) => canvas.input['write'] !== fingerprint));
      if (Object.keys(kept).length > 0) return show(history.replace(history.showing(), planOf(now.question, kept, { arrangements, arrangement: arrangementOfPlan(now), label: now.label })));
      history.drop(history.showing());
      return home === undefined ? history.current() : showScreen(home);
    };

    const write = async (data: unknown): Promise<{ saved: true }> => {
      const { write: fingerprint, fields } = WriteSchema.parse(data);
      if (!writes.has(fingerprint)) throw new Error(`This app ships no write ${fingerprint}.`);
      const response = await session.wire('/api/vex', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fingerprint, context: Object.fromEntries(fields.map((field) => [field.key, typeof field.value === 'string' ? field.value.trim() : field.value])) }),
      });
      if (!response.ok) throw new Error(`${fingerprint}: ${await response.text()}`);
      return { saved: true };
    };

    return [
      { id: 'ask', description: 'Answers a message with a screen, sent to the dock as the message `answer`. Send { text }; answers the plan: { question, position, total, canvases }.', execute: ask },
      { id: 'screens.open', description: 'Shows one of the screens in the dock: its canvases together. Send { opening: <screen id> }; answers its plan.', execute: open },
      { id: 'answers.back', description: 'Shows the answer before the one shown, and answers its plan.', execute: async () => show(history.back()) },
      { id: 'answers.forward', description: 'Shows the answer after the one shown, and answers its plan.', execute: async () => show(history.forward()) },
      { id: 'answers.go', description: 'Shows one answer from the stack. Send { going: <its position> }; answers its plan.', execute: async (data) => show(history.go(GoSchema.parse(data).going)) },
      { id: 'answers.saved', description: 'Takes a form that was saved off the answer shown. Send { saved: <the write it saved through> }; answers the plan.', execute: saved },
      { id: 'answers.write', description: 'Saves what a form holds through one of the writes the app ships. Send { write, fields: [{ key, value }] }.', execute: write },
    ];
  };
