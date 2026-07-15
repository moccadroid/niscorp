// The shell package — the app's assembly: the per-principal shell factory
// (shell.ts), the URL↔canvas route table (routes.ts), and the canvas-level
// layouts (frame + main-split). `buildShell(identity)` resolves the charter
// and constructs the shell from exactly the granted definitions.
export { buildShell, ACTIONS, CATALOG_DEFINITIONS, CharterBootError } from './shell';
