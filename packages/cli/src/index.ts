// @niscorp/cli — the `nisc` command, and the one file an app writes for it.
//
//   project.ts  — what an app says about itself (nisc.config.ts), and loading it
//   routes.ts   — which paths there are, where each one's file goes, the table
//   commands.ts — dev, build, export, start, check
//   cli.ts      — the command line
export type { NiscProject } from './project';
export { defaultPaths, fileOf, routeTable } from './routes';
export type { RouteReport } from './routes';
