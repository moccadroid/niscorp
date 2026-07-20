// @niscorp/nova/devtools — nova's own devtools, as pure nova.
//
// The dock is an ActionDefinition (data + layout + triggers + fns over
// nova/reflect) using only generic primitives, so it renders in any terminal.
// An app opts in: grant `devtools.*`, add the DEVTOOLS_CANVAS + a frame slot,
// and wire `createDevtoolsFunctions(session.shell)` into `functions(session)`.
// Per-session-correct because reflect reads the session's own shell.
import type { ActionDefinition } from '@action';
import { dockAction } from './dock';
import { inspectAction } from './inspect';

export { createDevtoolsFunctions, DEVTOOLS_CANVAS, type DevtoolsConfig, type TimelineEntry } from './fns';
export { dockAction } from './dock';
export { inspectAction } from './inspect';

// The actions to include in the app's catalog (and grant to a dev role — a
// `devtools.*` glob covers both). The dock is mounted/unmounted on the
// devtools canvas by `devtools.setEnabled` (an app's settings toggle drives
// it); every ⚙ pushes an inspector over it — the canvas stack IS the
// devtools navigation.
export const devtoolsActions: Record<string, ActionDefinition> = {
  'devtools.dock': dockAction,
  'devtools.inspect': inspectAction,
};
