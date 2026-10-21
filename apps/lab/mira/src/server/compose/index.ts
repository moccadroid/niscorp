import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { unverifiedShell } from '@niscorp/moss/unverified';
import { ARRANGEMENTS } from '../../app/arrangements';
import type { Arrangement } from '../../app/arrangements';
import { EXAMPLES, SCREENS } from '../../app/screens';
import type { Canvas, Screen } from '../../app/screens';
import { CATALOG } from './catalog';
import type { Catalog } from './catalog';
import { fill, systemOf, userOf } from './fill';
import type { Fill } from './fill';
import { createHistory } from './history';
import { pick } from './pick';
import type { Decide, Picks } from './pick';
import { planOf, textOf } from './plan';
import type { Plan, Said, Unnumbered } from './plan';
import { openScreen } from './screen';

export type { Decide, Picked, Question } from './pick';
export type { Fill } from './fill';
export type { Plan } from './plan';

export type Embed = (texts: string[]) => Promise<number[][]>;

// What answers a message: `decide` is Jev's pass, `fill` the chat model's call that composes the screen, with Jev's
// picks where there are any. Without `fill`, nothing can answer.
export type Models = { decide?: Decide; fill?: Fill; embed?: Embed; missing: readonly string[] };

const AskSchema = z.looseObject({ text: z.string() });
const OpenSchema = z.looseObject({ opening: z.string() });
const SavedSchema = z.looseObject({ saved: z.string() });
const GoSchema = z.looseObject({ going: z.coerce.number() });
const WriteSchema = z.looseObject({ write: z.string(), fields: z.array(z.looseObject({ key: z.string(), value: z.unknown() })) });

const ms = (from: number, to: number): string => `${Math.round(to - from)} ms`;

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const composer =
  (models: Models, catalog: Catalog = CATALOG, screens: readonly Screen[] = SCREENS, arrangements: readonly Arrangement[] = ARRANGEMENTS) =>
  (session: FunctionSession): FunctionDefinition[] => {
    const writes = new Set(catalog.writes.map((write) => write.fingerprint));
    const system = systemOf(catalog, screens, arrangements);
    let asked = 0;

    const home = screens[0];
    const homePlan = (): Unnumbered => planOf('', home?.canvases ?? [], {}, { ...(home !== undefined ? { screen: home } : {}), arrangement: home?.arrangement });
    // The stack starts at the first screen, as the shell opened it.
    const history = createHistory(home === undefined ? undefined : homePlan());

    // Each plan swaps its layout into the frame's `answers` region, then reaches the screen as the message `answer`,
    // which the bar places.
    // The swap goes around moss (`unverifiedShell`): moss lets a session change a layout only through a draft, and a
    // draft needs a signed-in person. When the app has sign-in, this moves to `session.draft`, where moss checks it.
    const show = (plan: Plan): Plan => {
      unverifiedShell(session).setLayout('answers', plan.layout);
      session.shell.publish('answer', plan);
      return plan;
    };

    // A screen already in the stack is gone back to, not stacked again; one that is not is shown as it is written.
    const openScreenOf = (screen: Screen): Plan => {
      const there = history.indexOf((plan) => plan.screen === screen.id);
      return show(there >= 0 ? history.go(there + 1) : history.add(planOf('', screen.canvases, {}, { screen, arrangement: screen.arrangement })));
    };

    // Words above what is on screen, which stays as it is: when nothing else answers.
    const saidOver = (message: string, said: Said, before: Plan): Plan => {
      const kept = Object.values(before.canvases).flatMap((canvases): Canvas[] => (canvases ?? []).filter((canvas) => canvas.action !== 'answer.text'));
      return show(history.add(planOf(message, [textOf(said, EXAMPLES), ...kept], before.canvases, { arrangement: before.arrangement })));
    };

    const ask = async (data: unknown): Promise<Plan> => {
      const message = AskSchema.parse(data).text.trim();
      if (message === '') return history.current();
      const before = history.current();
      if (models.fill === undefined) {
        return saidOver(message, { title: 'Nothing to answer with', text: `Set ${models.missing.join(' and ')} in .env, and start the app again.` }, before);
      }
      const turn = (asked += 1);
      const started = performance.now();
      const open = openScreen(session.shell, before);
      const decide = models.decide;
      const picks: Picks | undefined = decide === undefined ? undefined : await pick(message, open, catalog, screens, arrangements, decide).catch((error: unknown) => {
        console.error(`[ask] Jev could not answer "${message}": ${reasonOf(error)}`);
        return undefined;
      });
      const picked = performance.now();
      const filled = await fill(system, userOf(message, open, before.arrangement, picks), catalog, screens, arrangements, models.fill).catch((error: unknown) => {
        console.error(`[ask] the model could not answer "${message}": ${reasonOf(error)}`);
        return undefined;
      });
      const done = performance.now();
      console.log(`[ask] "${message}" — Jev ${ms(started, picked)} · model ${ms(picked, done)}${filled !== undefined && filled.calls > 1 ? ` (${filled.calls} calls)` : ''} · ${ms(started, done)}`);
      // A later message is being answered: this one's answer would only flash past.
      if (turn !== asked) return history.current();

      if (filled === undefined) return saidOver(message, { title: 'No answer this time', text: 'The model could not be reached. Ask again in a moment.' }, before);
      if ('refused' in filled) {
        console.error(`[ask] "${message}" was answered twice with what this app cannot show: ${filled.refused.join(' | ')}`);
        return saidOver(message, { title: 'That did not come together', text: 'The answer did not fit this app’s actions. Ask again, or put it differently.' }, before);
      }
      const { answer } = filled;
      const screen = answer.screen === undefined ? undefined : screens.find((candidate) => candidate.id === answer.screen);
      if (screen !== undefined) return openScreenOf(screen);
      const canvases = answer.said === undefined ? answer.canvases : [textOf(answer.said, EXAMPLES), ...answer.canvases];
      if (canvases.length === 0) return saidOver(message, { title: 'Nothing here answers that yet', text: 'Ask for something this app shows, or try one of these.' }, before);
      return show(history.add(planOf(message, canvases, before.canvases, { ...(answer.arrangement !== undefined ? { arrangement: answer.arrangement } : {}) })));
    };

    const open = async (data: unknown): Promise<Plan> => {
      const screen = screens.find((candidate) => candidate.id === OpenSchema.parse(data).opening);
      return screen === undefined ? history.current() : openScreenOf(screen);
    };

    // A form an answer opened has done its work once saved, and goes; on a screen it stays, emptied, for the next one.
    // An answer left with nothing leaves the stack, and the first screen is gone back to.
    const saved = async (data: unknown): Promise<Plan> => {
      const fingerprint = SavedSchema.parse(data).saved;
      const now = history.current();
      if (now.screen !== undefined) return now;
      const kept = Object.values(now.canvases)
        .flatMap((canvases) => canvases ?? [])
        .filter((canvas) => canvas.input['write'] !== fingerprint);
      if (kept.length > 0) return show(history.replace(history.showing(), planOf(now.question, kept, now.canvases, { arrangement: now.arrangement })));
      history.drop(history.showing());
      return home === undefined ? history.current() : openScreenOf(home);
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
      { id: 'ask', description: 'Answers a message with a screen, sent to the bar as the message `answer`. Send { text }; answers the plan: { question, position, total, canvases }.', execute: ask },
      { id: 'screens.open', description: 'Shows a screen from the menu: its canvases together. Send { opening: <screen id> }; answers its plan.', execute: open },
      { id: 'answers.back', description: 'Shows the answer before the one shown, and answers its plan.', execute: async () => show(history.back()) },
      { id: 'answers.forward', description: 'Shows the answer after the one shown, and answers its plan.', execute: async () => show(history.forward()) },
      { id: 'answers.go', description: 'Shows one answer from the stack. Send { going: <its position> }; answers its plan.', execute: async (data) => show(history.go(GoSchema.parse(data).going)) },
      { id: 'answers.saved', description: 'Takes a form that was saved off the answer shown. Send { saved: <the write it saved through> }; answers the plan.', execute: saved },
      { id: 'answers.write', description: 'Saves what a form holds through one of the writes the app ships. Send { write, fields: [{ key, value }] }.', execute: write },
    ];
  };
