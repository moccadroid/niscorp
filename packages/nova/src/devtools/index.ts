import type { ActionDefinition } from '@action';
import { dockAction } from './dock';
import { inspectAction } from './inspect';

export { createDevtoolsFunctions, DEVTOOLS_CANVAS, type DevtoolsConfig, type TimelineEntry } from './fns';
export { dockAction } from './dock';
export { inspectAction } from './inspect';

export const devtoolsActions: Record<string, ActionDefinition> = {
  'devtools.dock': dockAction,
  'devtools.inspect': inspectAction,
};
