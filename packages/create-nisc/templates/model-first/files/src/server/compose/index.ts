import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import type { FetchFn } from '@niscorp/nova';
import { ANSWERS } from '../../app/answers';
import type { PreparedAnswer } from '../../app/answers';
import { SCREENS } from '../../app/screens';
import type { Screen } from '../../app/screens';
import { fill } from './fill';
import type { Fill } from './fill';
import { createHistory } from './history';
import { optionsOf } from './options';
import type { Options, Rows } from './options';
import { pick } from './pick';
import type { Decide } from './pick';
import { placedOf, planOf, samePlan, textOf } from './plan';
import type { Chosen, Placed, Plan, Said } from './plan';

export type { Decide, Picked, Question } from './pick';
export type { Fill } from './fill';
export type { Plan } from './plan';

export type Embed = (texts: string[]) => Promise<number[][]>;

// What answers a message. `decide` picks prepared answers, in about 300 ms on a decision model; `fill` refines that
// with the chat model, and the refined plan replaces the first when it lands. Neither: nothing can answer.
export type Models = { decide?: Decide; fill?: Fill; embed?: Embed; missing: readonly string[] };

// A decision model is asked about at most 255 options at once: past that, the answers nearest the message go.
const MOST = 255;

const cosine = (one: readonly number[], other: readonly number[]): number => {
  let dot = 0;
  let a = 0;
  let b = 0;
  one.forEach((value, at) => {
    const theirs = other[at] ?? 0;
    dot += value * theirs;
    a += value * value;
    b += theirs * theirs;
  });
  return a === 0 || b === 0 ? 0 : dot / Math.sqrt(a * b);
};

const narrowed = async (message: string, answers: readonly PreparedAnswer[], embed: Embed | undefined): Promise<readonly PreparedAnswer[]> => {
  if (answers.length <= MOST) return answers;
  if (embed === undefined) return answers.slice(0, MOST);
  const [asked, ...shows] = await embed([message, ...answers.map((answer) => answer.shows)]);
  return answers
    .map((answer, at) => ({ answer, near: cosine(asked ?? [], shows[at] ?? []) }))
    .sort((one, other) => other.near - one.near)
    .slice(0, MOST)
    .map(({ answer }) => answer);
};

const vexRows =
  (wire: FetchFn): Rows =>
  async (fingerprint, context = {}) => {
    const response = await wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });
    if (!response.ok) throw new Error(`${fingerprint}: ${await response.text()}`);
    return response.json();
  };

const failed =
  (message: string) =>
  (error: unknown): undefined => {
    console.error(`[compose] the model could not answer "${message}":`, error instanceof Error ? error.message : error);
    return undefined;
  };

const AskSchema = z.looseObject({ text: z.string() });
const OpenSchema = z.looseObject({ opening: z.string() });
const SavedSchema = z.looseObject({ saved: z.string() });
const GoSchema = z.looseObject({ going: z.coerce.number() });
const WriteSchema = z.looseObject({ write: z.string(), fields: z.array(z.looseObject({ key: z.string(), value: z.unknown() })) });

export const composer =
  (models: Models, answers: readonly PreparedAnswer[] = ANSWERS, screens: readonly Screen[] = SCREENS) =>
  (session: FunctionSession): FunctionDefinition[] => {
    const rows = vexRows(session.wire);
    const examples = answers.map((answer) => answer.example);
    const writes = new Set(answers.flatMap((answer) => (typeof answer.input['write'] === 'string' ? [answer.input['write']] : [])));
    let asked = 0;

    const entriesOf = (screen: Screen): Placed[] =>
      screen.answers.flatMap((id) => {
        const answer = answers.find((candidate) => candidate.id === id);
        return answer === undefined ? [] : [placedOf({ answer, values: {} })];
      });
    const home = screens[0];
    const homeEntries = home === undefined ? [] : entriesOf(home);
    // The stack starts at the first screen, as the shell opened it.
    const history = createHistory(home === undefined ? undefined : planOf('', homeEntries, {}, home));
    const entriesFrom = (chosen: readonly Chosen[], said: Said | undefined): Placed[] => [...(said !== undefined ? [textOf(said, examples)] : []), ...chosen.map(placedOf)];
    // Words above the first screen: what is said when there is nothing else to show.
    const withHome = (said: Said): Placed[] => [textOf(said, examples), ...homeEntries];

    // Every plan reaches the screen as the message `answer`, which the bar places: one sender, so the picker's plan and
    // the model's that follows it arrive in the order they were made.
    const show = (plan: Plan): Plan => {
      session.shell.publish('answer', plan);
      return plan;
    };

    // The chat model's plan replaces the picker's in the history, and on screen only while it is still the one shown.
    // It is placed against the picker's, so what both show stays where it is.
    const refine = async (turn: number, first: Plan, message: string, offered: readonly PreparedAnswer[], options: Options, quick: readonly Chosen[], screen: readonly string[], fillWith: Fill): Promise<void> => {
      const better = await fill(message, offered, options, quick, screen, fillWith);
      const entries = better === undefined ? [] : entriesFrom(better.chosen, better.said);
      if (entries.length === 0) return;
      const plan = planOf(message, entries, first.canvases);
      if (samePlan(plan, first)) return;
      const index = first.position - 1;
      const now = history.replace(index, plan);
      if (turn === asked && history.showing() === index) show(now);
    };

    const ask = async (data: unknown): Promise<Plan> => {
      const message = AskSchema.parse(data).text.trim();
      if (message === '') return history.current();
      const before = history.current();
      if (models.decide === undefined) {
        return show(history.add(planOf(message, withHome({ title: 'Nothing to answer with', text: `Set ${models.missing.join(' and ')} in .env, and start the app again.` }), before.canvases)));
      }
      const turn = (asked += 1);
      const offered = await narrowed(message, answers, models.embed);
      const options = await optionsOf(offered, rows);
      const quick = await pick(message, offered, options, models.decide);
      // A picker sure of nothing is no answer yet: the chat model is asked before anything is shown, and the first
      // screen comes back, with a line saying so, only when it finds nothing either.
      if (quick.length === 0) {
        const better = models.fill === undefined ? undefined : await fill(message, offered, options, quick, before.answers, models.fill).catch(failed(message));
        const entries = better === undefined ? [] : entriesFrom(better.chosen, better.said);
        return show(history.add(planOf(message, entries.length > 0 ? entries : withHome({ title: 'Nothing here answers that yet', text: 'These are things this app can show.' }), before.canvases)));
      }
      const first = show(history.add(planOf(message, quick.map(placedOf), before.canvases)));
      if (models.fill !== undefined) void refine(turn, first, message, offered, options, quick, before.answers, models.fill).catch(failed(message));
      return first;
    };

    // A screen already in the stack is gone back to, not stacked again; one that is not is shown as it is written,
    // not arranged around what was on screen before.
    const open = async (data: unknown): Promise<Plan> => {
      const screen = screens.find((candidate) => candidate.id === OpenSchema.parse(data).opening);
      if (screen === undefined) return history.current();
      const there = history.indexOf((plan) => plan.screen === screen.id);
      return show(there >= 0 ? history.go(there + 1) : history.add(planOf('', entriesOf(screen), {}, screen)));
    };

    // A form an answer opened has done its work once saved, and goes; on a screen it stays, emptied, for the next one.
    // An answer left with nothing leaves the stack, and the first screen is gone back to.
    const saved = async (data: unknown): Promise<Plan> => {
      const fingerprint = SavedSchema.parse(data).saved;
      const now = history.current();
      if (now.screen !== undefined) return now;
      const kept = Object.values(now.canvases)
        .flatMap((entries) => entries ?? [])
        .filter((entry) => entry.input['write'] !== fingerprint);
      if (kept.length > 0) return show(history.replace(history.showing(), planOf(now.question, kept, now.canvases)));
      history.drop(history.showing());
      const there = history.indexOf((plan) => plan.screen === home?.id);
      return show(there >= 0 ? history.go(there + 1) : history.add(planOf('', homeEntries, {}, home)));
    };

    const write = async (data: unknown): Promise<{ saved: true }> => {
      const { write: fingerprint, fields } = WriteSchema.parse(data);
      if (!writes.has(fingerprint)) throw new Error(`No prepared answer writes through ${fingerprint}.`);
      await rows(fingerprint, Object.fromEntries(fields.map((field) => [field.key, typeof field.value === 'string' ? field.value.trim() : field.value])));
      return { saved: true };
    };

    return [
      { id: 'ask', description: 'Answers a message with a screen, sent to the bar as the message `answer`. Send { text }; answers the plan: { question, position, total, answers, canvases }.', execute: ask },
      { id: 'screens.open', description: 'Shows a screen from the menu: its prepared answers together. Send { opening: <screen id> }; answers its plan.', execute: open },
      { id: 'answers.back', description: 'Shows the answer before the one shown, and answers its plan.', execute: async () => show(history.back()) },
      { id: 'answers.forward', description: 'Shows the answer after the one shown, and answers its plan.', execute: async () => show(history.forward()) },
      { id: 'answers.go', description: 'Shows one answer from the stack. Send { going: <its position> }; answers its plan.', execute: async (data) => show(history.go(GoSchema.parse(data).going)) },
      { id: 'answers.saved', description: 'Takes a form that was saved off the answer shown. Send { saved: <the write it saved through> }; answers the plan.', execute: saved },
      { id: 'answers.write', description: 'Saves what a form holds through the write its prepared answer names. Send { write, fields: [{ key, value }] }.', execute: write },
    ];
  };
