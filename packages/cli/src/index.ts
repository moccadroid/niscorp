// @niscorp/cli — the `nisc` command, and the one file an app writes for it.
//
//   project.ts  — what an app says about itself (nisc.config.ts), and loading it
//   routes.ts   — which paths there are, where each one's file goes, the table
//   shell-site.ts — an app with its own shell: drawn ahead of time, and checked
//   adopt.ts    — the adoption check, a process with a DOM in it
//   commands.ts — dev, build, export, start, check
//   cli.ts      — the command line
export type { NiscProject, NiscMossProject, NiscShellProject } from './project';
export { placeScreen, shellRouteTable } from './shell-site';
export type { ShellRouteReport } from './shell-site';
export { defaultPaths, fileOf, routeTable } from './routes';
export type { RouteReport } from './routes';
