import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { ok, report } from './assert';

type Kind = 'row-backed' | 'authored' | 'singleton' | 'memo';
type Finding = { file: string; name: string; kind: Kind; why: string };

const ASSIGN = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
]);

const rowDerived = (fn: ts.Node): Set<string> => {
  const names = new Set<string>();
  const mentions = (n: ts.Node): boolean => {
    let hit = false;
    const visit = (x: ts.Node): void => {
      if (ts.isPropertyAccessExpression(x) && x.name.text === 'rows') hit = true;
      if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'query') hit = true;
      if (ts.isIdentifier(x) && names.has(x.text)) hit = true;
      ts.forEachChild(x, visit);
    };
    visit(n);
    return hit;
  };
  for (let pass = 0; pass < 3; pass += 1) {
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined && mentions(n.initializer)) names.add(n.name.text);
      if ((ts.isForOfStatement(n) || ts.isForInStatement(n)) && mentions(n.expression)) {
        const d = ts.isVariableDeclarationList(n.initializer) ? n.initializer.declarations[0] : undefined;
        if (d !== undefined && ts.isIdentifier(d.name)) names.add(d.name.text);
      }
      if (ts.isBinaryExpression(n) && ASSIGN.has(n.operatorToken.kind) && mentions(n.right)) {
        const left = n.left;
        const root = ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left) ? left.expression : left;
        if (ts.isIdentifier(root)) names.add(root.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(fn);
  }
  return names;
};

const enclosingFunction = (node: ts.Node): ts.Node | undefined => {
  let cursor: ts.Node | undefined = node.parent;
  while (cursor !== undefined) {
    if (ts.isFunctionDeclaration(cursor) || ts.isArrowFunction(cursor) || ts.isFunctionExpression(cursor) || ts.isMethodDeclaration(cursor)) return cursor;
    cursor = cursor.parent;
  }
  return undefined;
};

const writesTo = (source: ts.SourceFile, name: string): ts.Node[] => {
  const writes: ts.Node[] = [];
  const isTarget = (e: ts.Expression): boolean => {
    const root = ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) ? e.expression : e;
    return ts.isIdentifier(root) && root.text === name;
  };
  const visit = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && ASSIGN.has(n.operatorToken.kind) && isTarget(n.left)) writes.push(n);
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['set', 'push', 'clear', 'delete'].includes(n.expression.name.text) && isTarget(n.expression.expression)) {
      writes.push(n);
    }
    if (ts.isDeleteExpression(n) && isTarget(n.expression)) writes.push(n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(source, visit);
  return writes;
};

const isDrop = (write: ts.Node): boolean =>
  ts.isDeleteExpression(write) ||
  (ts.isCallExpression(write) && ts.isPropertyAccessExpression(write.expression) && ['clear', 'delete'].includes(write.expression.name.text));

const fromArgument = (write: ts.Node, source: ts.SourceFile): boolean => {
  const fn = enclosingFunction(write);
  if (fn === undefined) return false;
  const params = new Set(
    (fn as ts.FunctionLikeDeclaration).parameters.flatMap((p) => (ts.isIdentifier(p.name) ? [p.name.text] : [])),
  );
  if (params.size === 0) return false;
  let uses = false;
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && params.has(n.text)) uses = true;
    ts.forEachChild(n, visit);
  };
  visit(write);
  void source;
  return uses;
};

export const heldStateIn = (text: string, file = 'inline.ts'): Finding[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const findings: Finding[] = [];

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const name = decl.name.text;
      const isLet = (statement.declarationList.flags & ts.NodeFlags.Const) === 0;
      const writes = writesTo(source, name).filter((w) => !isDrop(w));

      if (writes.length === 0 && !isLet) continue;

      const inLoader = writes.some((w) => {
        const fn = enclosingFunction(w);
        if (fn === undefined) return false;
        const rows = rowDerived(fn);
        if (rows.size === 0) return false;
        // The value has to come from the rows, not merely sit in the same function as a query.
        let fromRows = false;
        const visit = (n: ts.Node): void => {
          if (ts.isIdentifier(n) && rows.has(n.text)) fromRows = true;
          if (ts.isPropertyAccessExpression(n) && n.name.text === 'rows') fromRows = true;
          ts.forEachChild(n, visit);
        };
        visit(w);
        return fromRows;
      });

      if (inLoader) {
        findings.push({ file, name, kind: 'row-backed', why: 'assigned inside a function that queries the database' });
        continue;
      }
      if (writes.length > 0 && writes.every((w) => fromArgument(w, source))) {
        findings.push({ file, name, kind: 'memo', why: 'keyed by an argument, not by a row' });
        continue;
      }
      if (isLet && writes.length > 0) {
        findings.push({ file, name, kind: 'singleton', why: 'assigned once, late — neither cache nor constant' });
        continue;
      }
      findings.push({ file, name, kind: 'authored', why: 'written, but never from a query result' });
    }
  }
  return findings;
};

const BAD = `
const DIRECTORY: Record<string, unknown> = {};
export const load = async (pool: Pool): Promise<void> => {
  const result = await pool.query('SELECT id FROM people');
  for (const row of result.rows) DIRECTORY[String(row.id)] = row;
};
`;

const BAD_LAUNDERED = `
let DIRECTORY: Record<string, unknown> = {};
export const load = async (pool: Pool): Promise<void> => {
  const result = await pool.query('SELECT id FROM people');
  const next: Record<string, unknown> = {};
  for (const row of result.rows) next[String(row.id)] = row;
  DIRECTORY = next;
};
`;

const GOOD_CONST = `const AUDIENCE_OF: Record<string, string> = { owner: 'owner', desk: 'desk' };`;

const GOOD_MEMO = `
const DAY_FORMAT: Record<string, Intl.DateTimeFormat> = {};
export const dayIn = (timezone: string): string =>
  (DAY_FORMAT[timezone] ??= new Intl.DateTimeFormat('en-CA', { timeZone: timezone })).format(new Date());
`;

const GOOD_SINGLETON = `
let driver: Driver | undefined;
export const start = (): void => { driver = createDriver(); };
`;

const GOOD_MEMO_DROPPED = `
const BOOK: Record<string, Promise<Phrasebook>> = {};
export const bookOverWire = async (wire: Wire, language: string): Promise<Phrasebook> =>
  (BOOK[language] ??= foldOverWire(wire, language));
export const forgetBooks = (): void => { for (const language of Object.keys(BOOK)) delete BOOK[language]; };
`;

const kindOf = (src: string, name: string): Kind | undefined => heldStateIn(src).find((f) => f.name === name)?.kind;

ok('the rule catches a row-backed cache', kindOf(BAD, 'DIRECTORY') === 'row-backed', String(kindOf(BAD, 'DIRECTORY')));
ok('...including one laundered through a local first', kindOf(BAD_LAUNDERED, 'DIRECTORY') === 'row-backed', String(kindOf(BAD_LAUNDERED, 'DIRECTORY')));
ok('...and does not condemn an authored constant', kindOf(GOOD_CONST, 'AUDIENCE_OF') !== 'row-backed', String(kindOf(GOOD_CONST, 'AUDIENCE_OF')));
ok('...nor a memo keyed by an argument', kindOf(GOOD_MEMO, 'DAY_FORMAT') === 'memo', String(kindOf(GOOD_MEMO, 'DAY_FORMAT')));
ok('...nor a late-bound singleton', kindOf(GOOD_SINGLETON, 'driver') === 'singleton', String(kindOf(GOOD_SINGLETON, 'driver')));
ok('...and a memo stays a memo when something can empty it', kindOf(GOOD_MEMO_DROPPED, 'BOOK') === 'memo', String(kindOf(GOOD_MEMO_DROPPED, 'BOOK')));
ok('...while a drop does not launder a row-backed cache', kindOf(`${BAD}\nexport const forget = (): void => { for (const k of Object.keys(DIRECTORY)) delete DIRECTORY[k]; };`, 'DIRECTORY') === 'row-backed');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

const files = walk('src').filter((f) => !f.includes(`${'dev'}${'/'}`) && !f.includes('\\dev\\'));
const found = files.flatMap((f) => heldStateIn(readFileSync(f, 'utf8'), relative('src', f).replace(/\\/g, '/')));
const rowBacked = found.filter((f) => f.kind === 'row-backed');

const SCHEDULED = new Set(['DIRECTORY', 'BY_EMAIL', 'INSTALLED', 'AUTOMATION', 'TIMEZONES', 'COUNTRIES', 'LOCALES', 'CURRENCIES', 'BY_STUDIO', 'BY_LOCALE', 'THEMES', 'PHRASES']);

const unscheduled = rowBacked.filter((f) => !SCHEDULED.has(f.name));

console.log(`\n  held state outside dev/: ${found.length} bindings — ${rowBacked.length} row-backed, ${found.filter((f) => f.kind === 'memo').length} memo, ${found.filter((f) => f.kind === 'singleton').length} singleton, ${found.filter((f) => f.kind === 'authored').length} authored`);
for (const f of rowBacked) console.log(`    ${SCHEDULED.has(f.name) ? 'scheduled' : 'NEW      '}  ${f.file.padEnd(28)} ${f.name}`);

ok(
  'no row-backed cache exists that the plan has not already scheduled for deletion',
  unscheduled.length === 0,
  unscheduled.length === 0 ? `${rowBacked.length} known, all named in 7.3` : unscheduled.map((f) => `${f.file}:${f.name}`).join(', '),
);

const stillHeld = new Set(rowBacked.map((f) => f.name));
const gone = [...SCHEDULED].filter((n) => !stillHeld.has(n));
console.log(`  ${gone.length} of ${SCHEDULED.size} scheduled caches are already gone${gone.length > 0 ? `: ${gone.join(', ')}` : ''}`);

ok('the identity path holds nothing of its own', heldStateIn(readFileSync('src/server/identity.ts', 'utf8')).filter((f) => f.kind === 'row-backed').length === 0, 'the seam that replaced the directory must not have grown one');

report('held state is classified rather than counted: the defect is a cache assigned from a query result, and the three legitimate kinds are named.');
