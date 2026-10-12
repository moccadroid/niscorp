import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/coverage/**',
      '**/.turbo/**',
      'eslint.config.mjs',
    ],
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // `any` and `as` are not here: the tree outside the modules still holds them.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'rule 16: no enum. A union of string literals is the same thing without a runtime object.',
        },
        {
          // An Error subclass is the exception: `instanceof` needs a class.
          selector: "ClassDeclaration:not([superClass.name='Error'])",
          message: 'rule 16: no class. A closure over data is how everything else here is written.',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'rule 16: no default export. A named export is greppable and cannot be silently renamed at the import.',
        },
      ],
    },
  },

  // `app/app.ts` is exempt: it is the composition root, where the seams are wired.
  {
    files: ['apps/lab/*/src/app/**/*.ts', 'apps/lab/*/src/app/**/*.tsx'],
    ignores: ['apps/lab/*/src/app/app.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*/server/*', '@lyra/server/*', '@atrium/server/*', '../server/*', '../../server/*', '../../../server/*'],
              message: 'app/ is artifacts; server/ is an edge. Take what you need through a seam declared in app/app.ts, not by reaching across.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/lab/*/src/app/**/*.ts', 'apps/lab/*/src/server/**/*.ts'],
    ignores: ['apps/lab/*/src/server/boot.ts', 'apps/lab/*/src/server/runtime.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program > VariableDeclaration[kind="let"]',
          message:
            'module-level `let` outlives the request that filled it. If it holds rows, it is the resident directory this codebase already paid for once (docs/plans/lyra-identity.md). If it is a late-bound singleton, put it in boot.ts where that is the file\'s job.',
        },
        { selector: 'TSEnumDeclaration', message: 'rule 16: no enum.' },
        { selector: "ClassDeclaration:not([superClass.name='Error'])", message: 'rule 16: no class (an Error subclass is the one exception).' },
        { selector: 'ExportDefaultDeclaration', message: 'rule 16: no default export.' },
      ],
    },
  },

  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program > VariableDeclaration[kind="let"]',
          message: 'module-level `let` in a library is process-global state. Put it in the closure that owns it.',
        },
        { selector: 'TSEnumDeclaration', message: 'rule 16: no enum.' },
        { selector: "ClassDeclaration:not([superClass.name='Error'])", message: 'rule 16: no class (an Error subclass is the one exception).' },
        { selector: 'ExportDefaultDeclaration', message: 'rule 16: no default export.' },
      ],
    },
  },

  // A package joins by having its `src/` added to `files` here and to the `lint`
  // script in `package.json`. These files are linted with the compiler's types, so
  // the packages are built first: a type from another package is read from its
  // `dist`, and is `any` without.
  {
    files: ['packages/moss/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', 'packages/tide/src/store/postgres/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', 'packages/tide/src/driver.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    linterOptions: { noInlineConfig: true },
    rules: {
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-unsafe-unary-minus': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program > VariableDeclaration[kind=/^(let|var)$/], Program > ExportNamedDeclaration > VariableDeclaration[kind=/^(let|var)$/]',
          message: 'module-level `let` in a library is process-global state. Put it in the closure that owns it.',
        },
        { selector: 'TSEnumDeclaration', message: 'rule 16: no enum.' },
        { selector: "ClassDeclaration:not([superClass.name='Error'])", message: 'rule 16: no class (an Error subclass is the one exception).' },
        { selector: 'ExportDefaultDeclaration', message: 'rule 16: no default export.' },
        {
          selector: 'TSTypePredicate',
          message: 'rule 16: no written type predicate (`x is T`, `asserts x`). It is a cast the compiler does not check. Narrow where the value is used, or leave the return type off and let the compiler infer the predicate.',
        },
        {
          selector: "TSAsExpression:not([typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name='const'])",
          message: 'rule 16: no type assertion. What comes from outside is parsed by a schema; what is inside is typed so it needs no cast.',
        },
        { selector: 'TSTypeAssertion', message: 'rule 16: no type assertion.' },
        { selector: 'TSNonNullExpression', message: 'rule 16: no non-null assertion. Narrow it.' },
        { selector: 'VariableDeclarator[definite=true], PropertyDefinition[definite=true]', message: 'rule 16: no `!` on a declaration. It says a value is there before anything has put it there.' },
        { selector: 'FunctionDeclaration', message: 'rule 16: no `function` declaration. An arrow function in a `const`.' },
      ],
      'max-lines-per-function': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      // Without a width the two sizes above count nothing. Not prettier's 100, which
      // nothing enforces.
      'max-len': ['error', { code: 200 }],
    },
  },

  {
    files: ['apps/lab/*/src/dev/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off' },
  },
);
