import type { SqlStep } from './schema';

// ═══════════════════════════════════════════════════════════════
// A DDL file as steps — one statement each, because a driver that prepares
// statements refuses a string carrying several.
//
// Splitting on every `;` is wrong, and quietly: a comment that contains one
// ("-- each is a role; `remit` says…") is cut in two, its tail becomes a line of
// SQL, and the step fails on the database it was meant to set up. A statement
// here ends only at a `;` that closes a line of SQL; comment lines never end
// one. Comments stay in the steps (the checksum ignores full-line comments).
//
// Not a SQL parser: a `;` at the end of a line inside a string literal or a
// function body would still end a statement. Write those as their own steps.
// ═══════════════════════════════════════════════════════════════

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
