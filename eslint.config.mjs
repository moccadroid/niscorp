import tseslint from 'typescript-eslint';

// ═══════════════════════════════════════════════════════════════
// ESLint here does ONE job the dev/*-check.ts suite cannot: it fires while the
// line is being written.
//
// The checks are more expressive than any lint rule — `sql-check` and
// `held-state-check` assert that their own rule catches a known-bad example,
// which no lint config does. But they fire after code is written, reviewed and
// merged. For a rule whose entire purpose is "do not start down this road",
// authoring time is the only time that matters: `server/phrases.ts` grew a
// resident cache because somebody who had already read the post-mortem about
// `server/users.ts` wrote it anyway (docs/plans/lyra-identity.md § 5, Move 3).
//
// So the rules here are STRUCTURAL — the ones about where code may live and
// what it may hold. The semantic rules stay in the checks, where they can be
// tested.
// ═══════════════════════════════════════════════════════════════

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

  // ── the whole monorepo: syntax that has no place anywhere ──
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Rule 16, the half that is mechanically enforceable without type
      // information and already true across the tree. `any` and `as` are NOT
      // here: 132 of them exist, 95 in `dev/`, and D5 ratified that checks are
      // not held to rule 16 while D8 ratified clean-not-baseline. A rule that
      // lands red is the thing this plan exists to stop doing — those come out
      // by hand first, then the rule follows them.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'rule 16: no enum. A union of string literals is the same thing without a runtime object.',
        },
        {
          // A custom Error is the one thing JavaScript will not let you build
          // without `class` — `instanceof` is the whole point of it, and a
          // factory returning a plain object does not answer it. Every other
          // class is a closure written the long way.
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

  // ── THE ONE ARCHITECTURAL FENCE ──
  //
  // `app/` is artifacts: actions, layouts, entries, the charter. `server/` is
  // one of the five licensed edges. An artifact reaching into an edge is how a
  // derivation ends up on the wrong side of the line that makes the census
  // meaningful — and it is exactly how `DIRECTORY` came to be read from the
  // application layer.
  //
  // `app/app.ts` is exempt because it is the composition root: the census
  // classifies it as `setup` rather than as an artifact, and wiring the seams
  // together is the whole of its job.
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

  // ── HELD STATE, at the keystroke ──
  //
  // The authoring-time half of held-state-check. That check knows the
  // difference between a row-backed cache and a formatter memo because it can
  // trace values; this cannot, so it asks the cheaper question — is this a
  // mutable module-level binding that gets REASSIGNED — and asks it in the two
  // directories where the answer has always been the disease. `const X = {}`
  // filled in place is still caught by the check at CI; `let X = ...; X = ...`
  // is the shape every one of the eight caches was written in.
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

  // ── the packages ──
  //
  // Same held-state rule, minus the app-directory assumptions. moss holds
  // caches on purpose now (identity/cache.ts, artifactory/generation.ts) — and holds them inside
  // closures, which is the point: state with an owner and a lifetime rather
  // than state at module scope.
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

  // ── moss's modules: the whole of rule 16, with types, and three sizes ──
  //
  // WHAT IT HOLDS: every file under moss's `src/`, and of tide the two things
  // that came out of moss, its Postgres store and its driver. The rest of tide
  // and every other package is held by the block above. A package joins by
  // having its `src/` added to `files` here and to the `lint` script in
  // `package.json` (packages/nisc/AGENTS.md, "Changing a package").
  //
  // The block above leaves `as` out because 132 of them existed and a rule
  // that lands red is the thing to stop doing. A MODULE is new ground: code
  // arrives in one of these directories by being moved there on purpose
  // (docs/plans/moss-refactor.md, scripts/check-modules.mts), and it arrives
  // clean. So from a module's first file: no type assertion but `as const` —
  // what crosses a boundary is parsed, not cast — no non-null assertion, no
  // `function` declaration, and no function or file that has stopped being one
  // thing. `createServer` reached 1,345 lines with nothing counting.
  //
  // WITH TYPES. A rule that reads syntax sees `as Row` and does not see
  // `const row: Row = JSON.parse(text)`, which is the same cast with nothing
  // written: `JSON.parse` answers `any`, and `any` becomes whatever it is
  // assigned to. So these files are linted with the compiler's types (each by
  // its package's own tsconfig), and an `any` may not be written, assigned,
  // passed, returned, called or read from. What arrives as `any` is given to
  // `unknown` and parsed. This needs the packages built: a type from another
  // package of the repository is read from its `dist`, and is `any` without.
  //
  // EVERY FILE UNDER `src/`, the one at the top included, and whatever its
  // extension: the pattern used to begin one directory down and name `.ts` and
  // `.tsx`, so `src/index.ts` and a `.mts` file were held by nothing. (The
  // module check refuses a file that is not `.ts` or `.tsx`; this is so that
  // the lint does not depend on it.)
  //
  // NO COMMENT SWITCHES A RULE OFF. `/* eslint-disable */` and the rest are
  // not read in these files (`noInlineConfig`), and the lint script fails on
  // the warning eslint gives for one, so none can sit there looking as if it
  // did something. `@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` switch
  // the compiler off for a line or a file, which is where an `any` comes from:
  // they are errors too.
  //
  // WHAT THIS CANNOT SEE. That a boundary is read by a schema: a value
  // narrowed by hand passes, and a type another package's function claims to
  // answer is believed. State a `const` holds at the top of a file (a `Map`
  // filled in place): only `let` and `var` are told. A file this block's
  // `files` or the `lint` script does not name. And a declaration file
  // (`.d.ts`), which the first block ignores everywhere: the module check
  // refuses one under `src/` of a package it holds.
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
          // Exported or not: `export let` is the same state with a door on it.
          selector: 'Program > VariableDeclaration[kind=/^(let|var)$/], Program > ExportNamedDeclaration > VariableDeclaration[kind=/^(let|var)$/]',
          message: 'module-level `let` in a library is process-global state. Put it in the closure that owns it.',
        },
        { selector: 'TSEnumDeclaration', message: 'rule 16: no enum.' },
        { selector: "ClassDeclaration:not([superClass.name='Error'])", message: 'rule 16: no class (an Error subclass is the one exception).' },
        { selector: 'ExportDefaultDeclaration', message: 'rule 16: no default export.' },
        {
          // A WRITTEN PREDICATE IS A CAST THE COMPILER DOES NOT CHECK:
          // `(v): v is Row => true` compiles. One the compiler works out for
          // itself is checked, and needs no syntax: `(v: unknown) => typeof
          // v === 'string'` narrows where it is called, and so does a
          // `filter` on `row !== undefined`. So the written form is not
          // needed where the narrowing is real, and is forbidden.
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
      // 200 lines is fine for a function; 300 is the ceiling, for the rare one
      // that reads better whole than cut up.
      'max-lines-per-function': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      // A line has a width, or the two sizes above count nothing: a function of
      // some lines holds what its lines hold. This is not prettier's 100,
      // which nothing enforces. Comments and strings count like code. Should a
      // later eslint drop `max-len`, the same rule is `@stylistic/max-len`.
      'max-len': ['error', { code: 200 }],
    },
  },

  // ── checks are held to the fences, not to rule 16 (D5) ──
  //
  // 95 of the tree's 132 type assertions live in `dev/`, and a check that pokes
  // at a rehydrated manifest to prove something about it is doing its job. What
  // a check may NOT do is hold state or reach past a fence.
  {
    files: ['apps/lab/*/src/dev/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off' },
  },
);
