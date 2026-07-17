// nova-devtools — a flag-gated debug layer for Nova screens, built OF Nova.
//
//   actions/  the portable definitions — dock + inspector actions and their
//             layouts. Pure data.
//   core/     headless, framework-free glue — the flag, the trace buffer +
//             shell taps, the traced fetch, the fn endpoint handlers, the
//             audit classifier, and the install.
//
// The framework adapter (panels, chip anchor) returns with
// devtools-in-the-terminal (SERVER.md step 4); the client-shell react
// layer is gone with the shell.
export { installNovaDevtools } from './core/install';
export { devtoolsFunctions } from './core/fns';
export { traceFetch } from './core/trace-fetch';
export { isDevtoolsEnabled, setDevtoolsEnabled, toggleDevtools, subscribeDevtools } from './core/flag';
