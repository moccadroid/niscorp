import type { Shell } from '@niscorp/nova';
import { bindDevtoolsShell } from './bridge';
import { dockAction } from '../actions/dock.action';
import { inspectAction } from '../actions/inspect.action';
import { devtoolsFrameFragment } from '../actions/frame.fragment';
import { attachShellLogging, bindLogNotifier, DEVTOOLS_CANVAS } from './log';
import { isDevtoolsEnabled, subscribeDevtools } from './flag';

// Headless install — everything except rendering. Registers the devtools
// actions, adds their canvas, attaches the telemetry taps, and keeps the
// canvas in sync with the flag: enable pushes the dock, disable clears the
// canvas (unmounting dock + any open inspector). Framework adapters only have
// to render the `devtools` canvas somewhere fixed and draw the chips.
export const installNovaDevtools = (shell: Shell): (() => void) => {
  bindDevtoolsShell(shell);
  bindLogNotifier(shell);
  shell.registerAction(dockAction);
  shell.registerAction(inspectAction);
  shell.registerFragment(devtoolsFrameFragment);
  shell.addCanvas({ id: DEVTOOLS_CANVAS });
  const detachTaps = attachShellLogging(shell);

  const sync = (): void => {
    const occupied = shell.getCanvasState(DEVTOOLS_CANVAS).stack.length > 0;
    if (isDevtoolsEnabled() && !occupied) shell.push(DEVTOOLS_CANVAS, 'devtools.dock');
    else if (!isDevtoolsEnabled() && occupied) shell.clear(DEVTOOLS_CANVAS);
  };
  const offFlag = subscribeDevtools(sync);
  sync();

  return () => {
    offFlag();
    detachTaps();
  };
};
