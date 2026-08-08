import type { RenderApi } from '@niscorp/nova';
import { createWire } from '../client';
import type { Wire } from '../client';
import { onHotkey } from './hotkey';

// ═══════════════════════════════════════════════════════════════
// @niscorp/moss/terminal — the terminal, owned by the protocol that defines
// it. A terminal is the wire (../client) plus a RENDER TARGET (react, dom,
// console, …) painting the wire's snapshot and sending events back. This
// module is framework-blind: the conductor drives one target against the
// wire; the switcher cycles targets on a hotkey, sharing one wire so the
// session survives the swap. Targets live in the subpaths (./react, ./dom);
// the framework-shaped code stays there, never here.
// ═══════════════════════════════════════════════════════════════

// What a target renders against — nova core's `RenderApi`: the wire's snapshot
// as pull functions (frame + per-canvas trees) plus the event sinks (dispatch
// tagged by canvas, publish). Aliased, not redeclared — the dom adapter, the
// react adapter, and this conductor share ONE contract, so a target written
// for nova's dom view drops straight onto the wire. A target never touches the
// wire directly.
export type TerminalApi = RenderApi;

// A mounted target: re-render on demand, tear down on swap.
export type TerminalMount = { update: () => void; destroy: () => void };

// A render target: paint the api onto the target's own surface, return the
// mount handle. The surface — a DOM root, a stdio pair — is construction
// config on the concrete target (`reactTarget({ root, … })`, `domTarget({
// root })`), never part of this contract: the conductor stays surface-blind
// and runs anywhere the wire does. A target renders once on mount; the
// conductor calls `update` on every wire change.
export type Target = (api: TerminalApi) => TerminalMount;

// The conductor: one target, one wire. Subscribes the target's `update` to
// the wire and routes events back. Nothing framework-shaped.
export const createTerminal = (config: { target: Target; wire: Wire }): { destroy: () => void } => {
  const { target, wire } = config;
  const api: TerminalApi = {
    frame: () => wire.snapshot().frame,
    canvasTree: (id) => wire.snapshot().trees.get(id) ?? [],
    dispatch: (id, event) => wire.dispatch(id, event),
    publish: (channel, payload) => wire.publish(channel, payload),
  };
  const mount = target(api);
  const unsubscribe = wire.subscribe(mount.update);
  return {
    destroy: () => {
      unsubscribe();
      mount.destroy();
    },
  };
};

export type MountTerminalConfig = {
  // render targets by name; the hotkey cycles them in insertion order
  targets: Record<string, Target>;
  // e.g. "ctrl+shift+t" — the live render-target swap. Omit for no swapping.
  swapKey?: string;
  // e.g. "ctrl+shift+r" — ask the server for a fresh shell. Omit for no key.
  //
  // The one control that must work when nothing else does. It sits on a
  // keystroke for the same reason the swap does — it acts on the terminal's
  // relationship to the server, not on anything the app models — but the
  // reason it exists at all is stronger: a shell lives on the SERVER, keyed by
  // principal, so a broken one survives every gesture a client can make alone.
  // Reloading reattaches to it. Clearing the token and signing back in
  // reattaches to it. Without a key that says "throw it away", somebody
  // watching a dead screen has no move left.
  resetKey?: string;
  // which target to mount first (default: the first key)
  initial?: string;
  // inject an existing wire (shared across swaps), or let the terminal make
  // one — `url` seeds a self-made wire (default: /socket on the host).
  wire?: Wire;
  url?: string;
};

// The switcher: mount a terminal that can hot-swap its render target on a
// keystroke, over ONE wire (created here unless injected) so the socket,
// session, and current trees survive the swap. The hotkey is the one legit
// piece of imperative client chrome — a render target is not app state, so
// it is not a nova action; it lives here, in the terminal.
export const mountTerminal = (config: MountTerminalConfig): { swap: () => void; reset: () => void; destroy: () => void } => {
  const keys = Object.keys(config.targets);
  if (keys.length === 0) throw new Error('mountTerminal: at least one target is required');

  const ownsWire = config.wire === undefined;
  const wire = config.wire ?? createWire(config.url !== undefined ? { url: config.url } : {});

  const targetAt = (i: number): Target => {
    const key = keys[i];
    const target = key === undefined ? undefined : config.targets[key];
    if (target === undefined) throw new Error(`mountTerminal: no target at index ${i}`);
    return target;
  };

  const start = config.initial === undefined ? 0 : keys.indexOf(config.initial);
  let index = start < 0 ? 0 : start;
  let active = createTerminal({ target: targetAt(index), wire });

  const swap = (): void => {
    active.destroy();
    index = (index + 1) % keys.length;
    active = createTerminal({ target: targetAt(index), wire });
  };

  const reset = (): void => wire.reset();

  const disposeSwapKey = config.swapKey === undefined ? undefined : onHotkey(config.swapKey, swap);
  const disposeResetKey = config.resetKey === undefined ? undefined : onHotkey(config.resetKey, reset);

  // Both are returned so a host can bind its own control (a button, a console
  // call) — the hotkeys are a convenience, not the only way in.
  return {
    swap,
    reset,
    destroy: () => {
      disposeSwapKey?.();
      disposeResetKey?.();
      active.destroy();
      if (ownsWire) wire.dispose();
    },
  };
};
