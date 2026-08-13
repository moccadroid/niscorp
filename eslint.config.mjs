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
  // caches on purpose now (identity.ts, generation.ts) — and holds them inside
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
