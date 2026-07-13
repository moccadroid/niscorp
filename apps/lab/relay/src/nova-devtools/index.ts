// nova-devtools — a flag-gated debug layer for Nova screens, built OF Nova.
//
//   actions/  the portable definitions — dock + inspector actions, their
//             layouts, and the chip layout. Pure data; ships unchanged to any
//             framework adapter.
//   core/     headless, framework-free glue — the debug flag, the trace
//             buffer + shell taps, the traced fetch, the `fn:` endpoint
//             handlers, the audit classifier, and the install.
//   react/    the framework adapter — two primitives (JsonTree,
//             DevtoolsPanel), the chip anchor, and the fixed canvas host.
//             This folder (~160 lines) is ALL a Svelte/Vue port reimplements.
//
//   toggle:  Cmd/Ctrl+Shift+D (persisted in localStorage `relay.devtools`)
//   chip:    every action instance gets a floating ⚙ chip → inspector action
//   dock:    bottom-right — shell stacks, event timeline, registry audit
//
// Headless pieces (core/fns, core/install, core/trace-fetch) are imported by
// shell.ts via deep paths so the shell's module graph stays React-free.
import './react/devtools.css';
import { relaySlotWrapper } from '../ui';
import { withDevtools } from './react/slot-wrapper';

export { withDevtools } from './react/slot-wrapper';
export { NovaDevtoolsRoot } from './react/root';
export { installNovaDevtools } from './core/install';
export { devtoolsFunctions } from './core/fns';
export { traceFetch } from './core/trace-fetch';
export { isDevtoolsEnabled, setDevtoolsEnabled, toggleDevtools, useDevtoolsEnabled } from './core/flag';

// Relay's slotWrapper with the debug chip composed in — module-level so the
// component identity is stable across renders.
export const devtoolsSlotWrapper = withDevtools(relaySlotWrapper);
