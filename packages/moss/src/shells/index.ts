// ═══════════════════════════════════════════════════════════════
// Shells — what somebody is looking at.
//
// The fourth question moss asks of a request, once it knows who is calling,
// what exists for them and what they may read and write: which screen is
// theirs right now. The shell runs here, on the server; a terminal draws what
// it is sent.
//
// WHAT A HOST IS HANDED (./config.ts) is a typed object of the functions and
// values it needs: one that answers what a principal's shell is made of, the
// app's code it calls, the wire, and its limits. No manifest and no runtime.
//
// THE HOST (./host.ts) keeps one shell for each signed-in principal and builds
// a throwaway one for anybody else: the cells, the idle sweep, the roster, a
// reset, a delivery, and adopting definitions that changed.
//
// THE BUILD OF ONE SHELL (./build.ts) is who it is for, what mounts on its
// canvases, the words it wears, and the session its app code is handed
// (./function-session.ts): who is calling, and what a session may do by name.
//
// WHAT A TRANSPORT HOLDS of one session (./shell-session.ts) is where a
// connection attaches and a terminal's messages are routed.
//
// THE STREAM (./stream.ts) renders a shell's canvases and its frame into
// messages and sends what changed. It is here and not with the socket because
// the last frame sent is kept per shell, and shared by every connection of it.
//
// THE DOCUMENT'S READ (./snapshot.ts) is the screen as it stands, taken
// without attaching, with whether anything on it can still happen
// (./liveness.ts).
//
// This module imports `runtime`, `protocol`, `manifest` and `data`, and
// nothing else of moss. Who somebody is, it is told: the composition it is
// handed was resolved by the identity module, where the server stands.
// ═══════════════════════════════════════════════════════════════

export { instrumentFunctions } from './function-session';
export { DEFAULT_IDLE_MS, createShellHost } from './host';
export { shellNeedOf } from './liveness';
export type { ShellNeed } from './liveness';
export type { ComponentContract, ShellComposition, ShellHooks, ShellHostConfig, ShellLimits } from './config';
export type { ShellConnection, ShellHost, ShellOpening, ShellReport, ShellSession, ShellSnapshot } from './types';
