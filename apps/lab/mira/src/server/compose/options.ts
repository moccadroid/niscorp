import type { PreparedAnswer } from '../../app/answers';

export type Rows = (fingerprint: string, context?: Record<string, unknown>) => Promise<unknown>;

// What an answer's `choose` input may be: the values of one field in the rows its read answers. At most 254, the
// choices a decision model is asked to pick among beside "none of these".
export type Options = Map<PreparedAnswer, Map<string, string[]>>;

const MOST = 254;

export const optionsOf = async (answers: readonly PreparedAnswer[], rows: Rows): Promise<Options> => {
  const options: Options = new Map();
  for (const answer of answers) {
    const paths = new Map<string, string[]>();
    for (const [path, choose] of Object.entries(answer.choose ?? {})) {
      const answered = await rows(choose.read);
      const values = Array.isArray(answered) ? answered.map((row: unknown) => (row !== null && typeof row === 'object' ? (row as Record<string, unknown>)[choose.field] : undefined)) : [];
      paths.set(path, [...new Set(values.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').map(String))].slice(0, MOST));
    }
    options.set(answer, paths);
  }
  return options;
};
