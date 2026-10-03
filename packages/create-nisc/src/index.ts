// create-nisc — `npm create nisc`: a new nisc application.
//
//   generate.ts — a template, copied and named, its versions pinned
//   docs.ts     — the new app's AGENTS.md (where the rules are) and PLAN.md
//   versions.ts — the set @niscorp/nisc was released with
//   cli.ts      — the walkthrough
export { generate, templateOf, validName, TEMPLATES } from './generate';
export type { CreateOptions, Posture, Ui } from './generate';
export { releasedSet } from './versions';
