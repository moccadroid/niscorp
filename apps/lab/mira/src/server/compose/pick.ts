import type { PreparedAnswer } from '../../app/answers';
import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { Options } from './options';
import type { Chosen } from './plan';

export type Question = { type: 'noul'; instructions: string } | { type: 'choice'; instructions: string; criteria: Record<string, string> };

// One decision: `yes` for a yes/no (a probability of 0.5 or more is yes), `choice` for a choice, and `p` the
// probability, where the model gave one.
export type Picked = { yes?: boolean; choice?: string; p?: number };

export type Decide = (state: Record<string, unknown>, questions: Record<string, Question>) => Promise<Record<string, Picked>>;

const NONE = 'none';

// What a screen shows, in words: what each of its answers shows.
export const screenShows = (screen: Screen, answers: readonly PreparedAnswer[]): string =>
  screen.answers.flatMap((id) => answers.find((answer) => answer.id === id)?.shows ?? []).join('; ');

// One pass of the decision model over the message alone: for each prepared answer, whether it answers the message,
// and for each input it chooses from rows, which value; for each screen, whether it does; and which arrangement the
// answer suits. An answer is shown when it is a yes and every value it chooses was picked, and a screen that is a yes
// shows its answers; the yeses are ordered by how sure the model was, a screen's answers in the screen's order.
export const pick = async (
  message: string,
  answers: readonly PreparedAnswer[],
  screens: readonly Screen[],
  arrangements: readonly Arrangement[],
  options: Options,
  decide: Decide,
): Promise<{ chosen: Chosen[]; arrangement?: string }> => {
  const questions: Record<string, Question> = {};
  if (arrangements.length > 0) {
    questions['arrangement'] = { type: 'choice', instructions: 'How should the answer to the message be laid out?', criteria: Object.fromEntries(arrangements.map((arrangement) => [arrangement.id, arrangement.suits])) };
  }
  answers.forEach((answer, at) => {
    questions[`show${at}`] = { type: 'noul', instructions: `Would ${answer.shows} answer the person's message?` };
    [...(options.get(answer) ?? new Map<string, string[]>())].forEach(([path, values], index) => {
      const question = answer.choose?.[path]?.question ?? path;
      questions[`choose${at}_${index}`] = { type: 'choice', instructions: question, criteria: { [NONE]: 'None of these', ...Object.fromEntries(values.map((value, v) => [`v${v}`, value])) } };
    });
  });
  screens.forEach((screen, at) => {
    questions[`screen${at}`] = { type: 'noul', instructions: `Would the screen "${screen.label}" — ${screenShows(screen, answers)} — answer the person's message?` };
  });
  const picked = await decide({ message }, questions);

  const shown: { chosen: Chosen; p: number }[] = [];
  answers.forEach((answer, at) => {
    const yes = picked[`show${at}`];
    if (yes?.yes !== true) return;
    const values: Record<string, unknown> = {};
    const paths = [...(options.get(answer) ?? new Map<string, string[]>())];
    const complete = paths.every(([path, choices], index) => {
      const choice = picked[`choose${at}_${index}`]?.choice ?? NONE;
      const value = choice.startsWith('v') ? choices[Number(choice.slice(1))] : undefined;
      if (value !== undefined) values[path] = value;
      return value !== undefined;
    });
    if (complete) shown.push({ chosen: { answer, values }, p: yes.p ?? 0.5 });
  });
  screens.forEach((screen, at) => {
    const yes = picked[`screen${at}`];
    if (yes?.yes !== true) return;
    for (const id of screen.answers) {
      const answer = answers.find((candidate) => candidate.id === id && candidate.choose === undefined);
      if (answer !== undefined && !shown.some(({ chosen }) => chosen.answer.id === id)) shown.push({ chosen: { answer, values: {} }, p: yes.p ?? 0.5 });
    }
  });
  const arrangement = picked['arrangement']?.choice;
  return {
    chosen: shown
      .sort((one, other) => other.p - one.p)
      .slice(0, AREAS.length)
      .map(({ chosen }) => chosen),
    ...(arrangement !== undefined ? { arrangement } : {}),
  };
};
