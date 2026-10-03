// create-nisc — `npm create nisc`: a new nisc application.
//
//   generate.ts — a template, copied and named, its versions pinned; never overwrites
//   docs.ts     — the new app's AGENTS.md (where the rules are) and PLAN.md
//   set.ts      — the nisc release the templates were checked against
//   cli.ts      — the walkthrough
export { generate, templateOf, validName, TEMPLATES } from './generate';
export type { CreateOptions, Created, Posture, Ui } from './generate';
export { testedSet } from './set';
