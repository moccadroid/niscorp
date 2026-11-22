import { resolve } from 'node:path';
import type * as TS from 'typescript';
import { pathOf } from './source';
import type { Finding } from './source';
import type { TypeScript } from './typescript';

// The manifest's factory takes the server's code seams and answers the manifest: setup, not code in the artifact tree.
export const MANIFEST = /^(Promise<)?NiscApp>?$/;

export const programOf = (ts: TypeScript, root: string): TS.Program => {
  const config = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (config === undefined || !resolve(config).startsWith(resolve(root))) throw new Error(`the shape check reads the app as its tsconfig.json says, and ${root} has none.`);
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
  if (parsed === undefined) throw new Error(`${config} could not be read.`);
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
};

const importedNames = (ts: TypeScript, clause: TS.ImportClause | undefined): TS.Identifier[] => {
  if (clause === undefined || clause.isTypeOnly) return [];
  const bindings = clause.namedBindings;
  const named = bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements.filter((element) => !element.isTypeOnly).map((element) => element.name) : [];
  return [...(clause.name === undefined ? [] : [clause.name]), ...named];
};

// What code outside src/app calls of it, read by the compiler under the app's own tsconfig, so a path alias counts.
export const appDataFindings = (ts: TypeScript, root: string, program: TS.Program): Finding[] => {
  const checker = program.getTypeChecker();
  const options = program.getCompilerOptions();
  return program.getSourceFiles().flatMap((source) => {
    const file = pathOf(root, resolve(source.fileName));
    if (!file.startsWith('src/') || file.startsWith('src/app/') || file.startsWith('src/dev/') || source.isDeclarationFile) return [];
    return source.statements.flatMap((statement) => {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
      const target = ts.resolveModuleName(statement.moduleSpecifier.text, source.fileName, options, ts.sys).resolvedModule?.resolvedFileName;
      if (target === undefined) return [];
      const from = pathOf(root, resolve(target));
      if (!from.startsWith('src/app/')) return [];
      return importedNames(ts, statement.importClause).flatMap((name) => {
        const calls = checker.getTypeAtLocation(name).getCallSignatures();
        if (calls.length === 0 || calls.every((call) => MANIFEST.test(checker.typeToString(call.getReturnType())))) return [];
        const line = source.getLineAndCharacterOfPosition(name.getStart(source)).line + 1;
        const symbol = checker.getSymbolAtLocation(name);
        const declared = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol).getName() : name.text;
        return [{ rule: 'data' as const, file, line, name: declared, what: `${name.text}, a function of ${from}` }];
      });
    });
  });
};
