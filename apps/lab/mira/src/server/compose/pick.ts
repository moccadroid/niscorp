import type { PreparedAnswer } from '../../app/answers';
import { AREAS } from '../../app/shell/areas';
import type { Options } from './options';
import type { Chosen } from './plan';

export type Question = { type: 'noul'; instructions: string } | { type: 'choice'; instructions: string; criteria: Record<string, string> };

// One decision: `yes` for a yes/no (a probability of 0.5 or more is yes), `choice` for a choice, and `p` the
// probability, where the model gave one.
export type Picked = { yes?: boolean; choice?: string; p?: number };

export type Decide = (state: Record<string, unknown>, questions: Record<string, Question>) => Promise<Record<string, Picked>>;

const NONE = 'none';

// One pass of the decision model over the message alone: for each prepared answer, whether it answers the message,
// and for each input it chooses from rows, which value. An answer is shown when it is a yes and every value it
// chooses was picked; the yeses are ordered by how sure the model was.
export const pick = async (message: string, answers: readonly PreparedAnswer[], options: Options, decide: Decide): Promise<Chosen[]> => {
  const questions: Record<string, Question> = {};
  answers.forEach((answer, at) => {
    questions[`show${at}`] = { type: 'noul', instructions: `Would ${answer.shows} answer the person's message?` };
    [...(options.get(answer) ?? new Map<string, string[]>())].forEach(([path, values], index) => {
      const question = answer.choose?.[path]?.question ?? path;
      questions[`choose${at}_${index}`] = { type: 'choice', instructions: question, criteria: { [NONE]: 'None of these', ...Object.fromEntries(values.map((value, v) => [`v${v}`, value])) } };
    });
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
  return shown
    .sort((one, other) => other.p - one.p)
    .slice(0, AREAS.length)
    .map(({ chosen }) => chosen);
};
