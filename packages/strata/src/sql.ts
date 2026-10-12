import type { SqlStep } from './schema';

// A statement ends only at a `;` that closes a line of SQL: splitting on every
// `;` would cut a comment that contains one in two. Not a SQL parser: a `;`
// ending a line inside a string literal or a function body still ends a statement.

const isComment = (line: string): boolean => line.trim().startsWith('--');

export const sqlSteps = (ddl: string): SqlStep[] => {
  const steps: SqlStep[] = [];
  let buffer: string[] = [];
  const flush = (): void => {
    const sql = buffer.join('\n').trim().replace(/;\s*$/, '').trim();
    if (sql.split('\n').some((line) => line.trim() !== '' && !isComment(line))) steps.push({ kind: 'sql', sql });
    buffer = [];
  };
  for (const line of ddl.split('\n')) {
    buffer.push(line);
    if (!isComment(line) && line.trimEnd().endsWith(';')) flush();
  }
  flush();
  return steps;
};
