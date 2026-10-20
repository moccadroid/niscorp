import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import type { FetchFn } from '@niscorp/nova';
import { ANSWERS } from '../../app/answers';
import type { PreparedAnswer } from '../../app/answers';
import { fill } from './fill';
import type { Fill } from './fill';
import { createHistory } from './history';
import { optionsOf } from './options';
import type { Options, Rows } from './options';
import { pick } from './pick';
import type { Decide } from './pick';
import { notice, placed, samePlan } from './plan';
import type { Chosen, Plan, Unnumbered } from './plan';

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
const WriteSchema = z.looseObject({ write: z.string(), fields: z.array(z.looseObject({ key: z.string(), value: z.unknown() })) });

export const composer =
  (models: Models, answers: readonly PreparedAnswer[] = ANSWERS) =>
  (session: FunctionSession): FunctionDefinition[] => {
    const history = createHistory();
    const rows = vexRows(session.wire);
    const examples = answers.map((answer) => answer.example);
    const writes = new Set(answers.flatMap((answer) => (typeof answer.input['write'] === 'string' ? [answer.input['write']] : [])));
    let asked = 0;

    // Every plan reaches the screen as the message `answer`, which the bar places: one sender, so the picker's plan and
    // the model's that follows it arrive in the order they were made.
    const show = (plan: Plan): Plan => {
      session.shell.publish('answer', plan);
      return plan;
    };

    // The chat model's plan replaces the picker's in the history, and on screen only while it is still the one shown.
    const refine = async (turn: number, index: number, message: string, offered: readonly PreparedAnswer[], options: Options, quick: readonly Chosen[], screen: readonly string[], fillWith: Fill): Promise<void> => {
      const better = await fill(message, offered, options, quick, screen, fillWith);
      if (better === undefined || better.length === 0) return;
      const plan = placed(message, better);
      if (samePlan(plan, placed(message, quick))) return;
      const now = history.replace(index, plan);
      if (turn === asked && history.showing() === index) show(now);
    };

    const ask = async (data: unknown): Promise<Plan> => {
      const message = AskSchema.parse(data).text.trim();
      if (message === '') return history.current();
      if (models.decide === undefined) return show(history.add(notice(message, 'Nothing to answer with', `Set ${models.missing.join(' and ')} in .env, and start the app again.`, [])));
      const turn = (asked += 1);
      const screen = history.current().answers;
      const offered = await narrowed(message, answers, models.embed);
      const options = await optionsOf(offered, rows);
      const quick = await pick(message, offered, options, models.decide);
      const nothing = (): Unnumbered => notice(message, 'Nothing here answers that yet', 'These are things this app can show:', examples);
      // A picker sure of nothing is no answer yet: the chat model is asked before anything is shown, and a notice is
      // shown only when it finds nothing either.
      if (quick.length === 0) {
        const better = models.fill === undefined ? undefined : await fill(message, offered, options, quick, screen, models.fill).catch(failed(message));
        return show(history.add(better !== undefined && better.length > 0 ? placed(message, better) : nothing()));
      }
      const first = show(history.add(placed(message, quick)));
      if (models.fill !== undefined) {
        void refine(turn, first.position - 1, message, offered, options, quick, screen, models.fill).catch(failed(message));
      }
      return first;
    };

    const write = async (data: unknown): Promise<{ saved: true }> => {
      const { write: fingerprint, fields } = WriteSchema.parse(data);
      if (!writes.has(fingerprint)) throw new Error(`No prepared answer writes through ${fingerprint}.`);
      await rows(fingerprint, Object.fromEntries(fields.map((field) => [field.key, typeof field.value === 'string' ? field.value.trim() : field.value])));
      return { saved: true };
    };

    return [
      { id: 'ask', description: 'Answers a message with a screen, sent to the bar as the message `answer`. Send { text }; answers the plan: { question, position, total, answers, canvases }.', execute: ask },
      { id: 'answers.back', description: 'Shows the answer before the one shown, and answers its plan.', execute: async () => show(history.back()) },
      { id: 'answers.forward', description: 'Shows the answer after the one shown, and answers its plan.', execute: async () => show(history.forward()) },
      { id: 'answers.write', description: 'Saves what a form holds through the write its prepared answer names. Send { write, fields: [{ key, value }] }.', execute: write },
    ];
  };
