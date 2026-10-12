import type { RenderApi } from '@niscorp/nova';
import { createWire } from '../client';
import type { Wire, WireStatus } from '../client';
import { onHotkey } from './hotkey';
import { trapBack } from './history';
import { followHead } from './head';

export type TerminalApi = RenderApi & { status: () => WireStatus };

export type TerminalMount = { update: () => void; destroy: () => void };

export type Target = (api: TerminalApi) => TerminalMount;

export const createTerminal = (config: { target: Target; wire: Wire }): { destroy: () => void } => {
  const { target, wire } = config;
  const api: TerminalApi = {
    frame: () => wire.snapshot().frame,
    canvasTree: (id) => wire.snapshot().trees.get(id) ?? [],
    dispatch: (id, event) => wire.dispatch(id, event),
    publish: (channel, payload) => wire.publish(channel, payload),
    status: () => wire.status(),
  };
  const mount = target(api);
  const unsubscribe = wire.subscribe(mount.update);
  const stopHead = followHead(api, wire.subscribe);
  return {
    destroy: () => {
      unsubscribe();
      stopHead();
      mount.destroy();
    },
  };
};

export type MountTerminalConfig = {
  targets: Record<string, Target>;
  swapKey?: string;
  resetKey?: string;
  trapBack?: boolean;
  initial?: string;
  wire?: Wire;
  url?: string;
};

export const mountTerminal = (config: MountTerminalConfig): { swap: () => void; reset: () => void; back: () => void; destroy: () => void } => {
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
  const back = (): void => wire.back();

  const disposeSwapKey = config.swapKey === undefined ? undefined : onHotkey(config.swapKey, swap);
  const disposeResetKey = config.resetKey === undefined ? undefined : onHotkey(config.resetKey, reset);
  const disposeBackTrap = config.trapBack === false ? undefined : trapBack(back);

  return {
    swap,
    reset,
    back,
    destroy: () => {
      disposeSwapKey?.();
      disposeResetKey?.();
      disposeBackTrap?.();
      active.destroy();
      if (ownsWire) wire.dispose();
    },
  };
};
