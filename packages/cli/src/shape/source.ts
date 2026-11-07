import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type * as TS from 'typescript';
import type { TypeScript } from './typescript';

export type SourceRule = 'style' | 'formatting' | 'roles' | 'files' | 'address' | 'dom';

export type Finding = { rule: SourceRule | 'data'; file: string; line: number; what: string };

const SOURCE = /\.(ts|tsx|mts|cts)$/;

export const pathOf = (root: string, file: string): string => relative(root, file).split(sep).join('/');

export const sourceFilesOf = (root: string, dir = join(root, 'src')): string[] => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesOf(root, path);
    return SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
};

const READ_FILE = new Set(['readAsDataURL', 'readAsText', 'readAsArrayBuffer', 'readAsBinaryString']);
const FIND_ELEMENTS = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName', 'getElementsByName']);
const ADDRESS_CHANGE = new Set(['pushState', 'replaceState']);

const lastName = (ts: TypeScript, node: TS.Expression): string | undefined => {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
};

const hasModifier = (ts: TypeScript, node: TS.Node, kind: TS.SyntaxKind): boolean => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

// Each rule reads the syntax tree, so a word in a comment or a string is never a finding.
const findingsIn = (ts: TypeScript, file: string, source: TS.SourceFile): Finding[] => {
  const found: Finding[] = [];
  const inSrc = (folder: string): boolean => file.startsWith(`src/${folder}/`);
  const at = (rule: SourceRule, node: TS.Node, what: string): void => {
    found.push({ rule, file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, what });
  };
  const visit = (node: TS.Node): void => {
    if (ts.isAsExpression(node) && !(ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const')) at('style', node, `"as ${node.type.getText(source)}"`);
    if (ts.isTypeAssertionExpression(node)) at('style', node, 'a "<T>" assertion');
    if (ts.isNonNullExpression(node)) at('style', node, 'a non-null "!"');
    if (ts.isFunctionDeclaration(node) && !hasModifier(ts, node, ts.SyntaxKind.DeclareKeyword)) at('style', node, 'a function declaration');
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) at('style', node, 'a class');
    if (ts.isEnumDeclaration(node)) at('style', node, 'an enum');
    if (node.kind === ts.SyntaxKind.AnyKeyword) at('style', node, '"any"');
    if ((ts.isExportAssignment(node) && node.isExportEquals !== true) || (ts.isExportSpecifier(node) && node.name.text === 'default') || hasModifier(ts, node, ts.SyntaxKind.DefaultKeyword)) at('style', node, 'a default export');

    if (!inSrc('dev')) {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Intl') at('formatting', node, `Intl.${node.name.text}`);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text.startsWith('toLocale')) at('formatting', node, `.${node.expression.name.text}()`);
    }
    if (inSrc('server') && ts.isPropertyAccessExpression(node) && node.name.text === 'roles') {
      const whose = lastName(ts, node.expression);
      if (whose === 'session' || whose === 'principal') at('roles', node, `${whose}.roles`);
    }
    if (inSrc('ui')) {
      if (ts.isIdentifier(node) && node.text === 'FileReader' && !ts.isTypeReferenceNode(node.parent)) at('files', node, 'FileReader');
      if (ts.isPropertyAccessExpression(node) && READ_FILE.has(node.name.text)) at('files', node, node.name.text);
      if (ts.isPropertyAccessExpression(node) && lastName(ts, node.expression) === 'location') at('address', node, `location.${node.name.text}`);
      if (ts.isPropertyAccessExpression(node) && lastName(ts, node.expression) === 'history' && ADDRESS_CHANGE.has(node.name.text)) at('address', node, `history.${node.name.text}`);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && FIND_ELEMENTS.has(node.expression.name.text) && lastName(ts, node.expression.expression) === 'document') {
        at('dom', node, `document.${node.expression.name.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

export const sourceFindings = (ts: TypeScript, root: string): Finding[] =>
  sourceFilesOf(root).flatMap((path) => {
    const file = pathOf(root, path);
    const source = ts.createSourceFile(file, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    return findingsIn(ts, file, source);
  });
