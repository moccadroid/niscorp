import { z } from 'zod';
import type { PreparedAnswer } from '../../app/answers';
import { AREAS } from '../../app/shell/areas';
import type { Options } from './options';
import type { Chosen } from './plan';

export type Fill = <T>(system: string, user: string, schema: z.ZodType<T>) => Promise<T>;

const Reply = z.object({
  answers: z
    .array(z.object({ id: z.string().describe('A prepared answer’s id.'), set: z.record(z.string(), z.string()).optional().describe('Its inputs, by path: only the paths listed for it.') }))
    .max(AREAS.length),
});

const catalogOf = (answers: readonly PreparedAnswer[], options: Options): string =>
  answers
    .map((answer) => {
      const sets = Object.entries(answer.set ?? {}).map(([path, what]) => `${path}: ${what}`);
      const chooses = [...(options.get(answer) ?? new Map<string, string[]>())].map(([path, values]) => `${path}: one of ${values.map((value) => JSON.stringify(value)).join(', ')} (required)`);
      const inputs = [...chooses, ...sets];
      return `- ${answer.id} — ${answer.shows}${inputs.length > 0 ? `\n  set: ${inputs.join('; ')}` : ''}`;
    })
    .join('\n');

const system = (answers: readonly PreparedAnswer[], options: Options): string => `You answer a person's message with a screen. The screen is made of prepared answers; you choose which, and fill in their inputs from the message. You never write text for the person: the screen is the answer.

The prepared answers (id — what it shows; the inputs you may set):
${catalogOf(answers, options)}

Reply with { "answers": [{ "id": "...", "set": { "<path>": "<value>" } }] }: the prepared answers the message asks for, the most important first, at most ${AREAS.length}. Set an input only where the message says what goes in it, and only the paths listed for that answer; an input marked required must be set, from the values listed. When nothing fits, reply { "answers": [] }.`;

const user = (message: string, quick: readonly Chosen[], screen: readonly string[]): string =>
  [`Message: ${message}`, `A fast picker chose: ${quick.length > 0 ? quick.map((one) => one.answer.id).join(', ') : 'nothing'}`, `On screen before this message: ${screen.length > 0 ? screen.join(', ') : 'nothing'}`].join('\n');

// Rejected whole: an id that is no prepared answer, a path it may not set, a choice that is not among its values, or
// a required choice left out. The fast picker's plan stands instead.
export const fill = async (message: string, answers: readonly PreparedAnswer[], options: Options, quick: readonly Chosen[], screen: readonly string[], fillWith: Fill): Promise<Chosen[] | undefined> => {
  const reply = await fillWith(system(answers, options), user(message, quick, screen), Reply);
  const chosen: Chosen[] = [];
  for (const one of reply.answers) {
    const answer = answers.find((candidate) => candidate.id === one.id);
    if (answer === undefined) return undefined;
    const choices = options.get(answer) ?? new Map<string, string[]>();
    const set = one.set ?? {};
    for (const [path, value] of Object.entries(set)) {
      const allowed = choices.get(path);
      if (allowed !== undefined ? !allowed.includes(value) : answer.set?.[path] === undefined) return undefined;
    }
    if ([...choices.keys()].some((path) => set[path] === undefined)) return undefined;
    chosen.push({ answer, values: set });
  }
  return chosen;
};
