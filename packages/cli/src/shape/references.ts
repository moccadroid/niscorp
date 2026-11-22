import { dirname, join, resolve, sep } from 'node:path';
import type * as TS from 'typescript';
import { MANIFEST } from './app-data';
import { ADDRESS_CHANGE, FIND_ELEMENTS, pathOf } from './source';
import type { Finding, SourceRule } from './source';
import type { TypeScript } from './typescript';

const packageRootOf = (ts: TypeScript, file: string): string | undefined => {
  const up = dirname(file);
  if (ts.sys.fileExists(join(up, 'package.json'))) return up;
  return up === file ? undefined : packageRootOf(ts, up);
};

// The reaches the source rules find by spelling, found again by what each name refers to.
export const referenceFindings = (ts: TypeScript, root: string, program: TS.Program): Finding[] => {
  const checker = program.getTypeChecker();
  const moss = ts.resolveModuleName('@niscorp/moss', join(root, 'package.json'), program.getCompilerOptions(), ts.sys).resolvedModule?.resolvedFileName;
  const mossRoot = moss === undefined ? undefined : packageRootOf(ts, resolve(moss));
  const isDeclaredIn = (symbol: TS.Symbol | undefined, where: (source: TS.SourceFile) => boolean): boolean => (symbol?.declarations ?? []).some((declaration) => where(declaration.getSourceFile()));
  const isLibrary = (symbol: TS.Symbol | undefined): boolean => isDeclaredIn(symbol, (source) => program.isSourceFileDefaultLibrary(source));
  const isMoss = (symbol: TS.Symbol | undefined): boolean => mossRoot !== undefined && isDeclaredIn(symbol, (source) => resolve(source.fileName).startsWith(`${mossRoot}${sep}`));
  const typeIs = (node: TS.Node, name: string): boolean => {
    const symbol = checker.getTypeAtLocation(node).getSymbol();
    return symbol?.getName() === name && isLibrary(symbol);
  };
  const unaliased = (symbol: TS.Symbol | undefined): TS.Symbol | undefined => (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol);
  // A name a destructuring binds refers to the property it takes.
  const referredOf = (node: TS.Identifier | TS.StringLiteral): TS.Symbol | undefined => {
    const bound = node.parent;
    if (ts.isBindingElement(bound) && bound.name === node && ts.isObjectBindingPattern(bound.parent)) {
      const property = bound.propertyName ?? node;
      return ts.isIdentifier(property) || ts.isStringLiteral(property) ? unaliased(checker.getTypeAtLocation(bound.parent).getProperty(property.text)) : undefined;
    }
    return unaliased(checker.getSymbolAtLocation(node));
  };
  const isAppFunction = (symbol: TS.Symbol, node: TS.Node): boolean => {
    const declared = symbol.valueDeclaration;
    if (declared === undefined || !pathOf(root, resolve(declared.getSourceFile().fileName)).startsWith('src/app/')) return false;
    const calls = checker.getTypeOfSymbolAtLocation(symbol, node).getCallSignatures();
    return calls.length > 0 && !calls.every((call) => MANIFEST.test(checker.typeToString(call.getReturnType())));
  };

  return program.getSourceFiles().flatMap((source) => {
    const file = pathOf(root, resolve(source.fileName));
    if (!file.startsWith('src/') || source.isDeclarationFile) return [];
    const inSrc = (folder: string): boolean => file.startsWith(`src/${folder}/`);
    const found: Finding[] = [];
    const at = (rule: SourceRule | 'data', node: TS.Node, name: string, what = name): void => {
      found.push({ rule, file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, name, what });
    };
    const visit = (node: TS.Node, isType: boolean): void => {
      const isName = ts.isIdentifier(node) || (ts.isStringLiteral(node) && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node);
      const referred = !isType && isName ? referredOf(node) : undefined;
      if (referred !== undefined) {
        if (!inSrc('dev') && referred.getName() === 'Intl' && isLibrary(referred)) at('formatting', node, 'Intl', 'Intl, the global one');
        if (inSrc('server') && referred.getName() === 'roles' && isMoss(referred)) at('roles', node, 'roles', 'roles, read off a moss session');
        if (!inSrc('app') && !inSrc('dev') && isAppFunction(referred, node)) {
          at('data', node, referred.getName(), `${referred.getName()}, a function of ${pathOf(root, resolve(referred.valueDeclaration?.getSourceFile().fileName ?? ''))}`);
        }
      }
      if (!isType && inSrc('ui')) {
        const isLocation = (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && typeIs(node, 'Location');
        if (isLocation && !(ts.isExpression(node.parent) && typeIs(node.parent, 'Location'))) at('address', node, 'location', `location, as ${node.getText(source)}`);
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const { name, expression } = node.expression;
          if (ADDRESS_CHANGE.has(name.text) && typeIs(expression, 'History')) at('address', node, name.text, `${name.text} on a History`);
          if (FIND_ELEMENTS.has(name.text) && typeIs(expression, 'Document')) at('dom', node, name.text, `${name.text} on a Document`);
        }
      }
      ts.forEachChild(node, (child) => visit(child, isType || ts.isTypeNode(node)));
    };
    visit(source, false);
    return found;
  });
};
