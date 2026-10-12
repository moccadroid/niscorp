import { createElement, type FC } from 'react';
import { render, Text as InkText } from 'ink';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { defaultRegistry, fallback as inkFallback, TextWrap, ErrorMarker, FrameControlsContext } from '@niscorp/nova/adapters/ink';
import type { ComponentRegistry } from '@niscorp/nova';
import type { Target, TerminalApi } from '../index';
import { terminalFrame } from '../react/frame';
import { registerWireSlots } from '../react/slots';
import type { TerminalSlotWrapper } from '../react/slots';
import { STATUS_WORDS } from '../status';
import { createMarks, markerProviders } from './marks';
import { navOf } from './nav';

export type InkTargetConfig = {
  registry?: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  onQuit?: () => void;
  patchConsole?: boolean;
};

const statusLineOf = (status: TerminalApi['status']): FC => () => {
  const now = status();
  if (now === 'open') return null;
  if (now === 'incompatible') return createElement(InkText, { color: 'red' }, STATUS_WORDS.incompatible);
  return now === 'connecting' ? createElement(InkText, { color: 'yellow' }, STATUS_WORDS.connecting) : createElement(InkText, { color: 'red' }, STATUS_WORDS.lost);
};

export const inkTarget = (config: InkTargetConfig = {}): Target => (api) => {
  const registry = config.registry ?? defaultRegistry();
  const marks = createMarks(api);
  registerWireSlots(registry, {
    slotWrapper: config.slotWrapper,
    fallback: inkFallback,
    textWrapper: TextWrap,
    errorMarker: ErrorMarker,
    ...markerProviders(marks),
  });

  const typingRef = { current: false };
  const frameControls = { setTyping: (typing: boolean): void => void (typingRef.current = typing) };
  const Nav = navOf({ api, marks, typing: () => typingRef.current });
  const StatusLine = statusLineOf(api.status);

  const Frame: FC = () => {
    marks.reindex();
    return createElement(
      FrameControlsContext.Provider,
      { value: frameControls },
      createElement(Nav),
      createElement(StatusLine),
      terminalFrame(api, registry, { fallback: inkFallback, textWrapper: TextWrap, errorMarker: ErrorMarker }),
    );
  };

  const instance = render(createElement(Frame), {
    ...(config.stdout !== undefined ? { stdout: config.stdout } : {}),
    ...(config.stdin !== undefined ? { stdin: config.stdin } : {}),
    exitOnCtrlC: true,
    patchConsole: config.patchConsole ?? true,
  });
  let destroyed = false;
  const ended = (): void => {
    if (!destroyed) config.onQuit?.();
  };
  void instance.waitUntilExit().then(ended, (error: unknown) => {
    console.error('[moss/ink] the terminal ended on an error:', error);
    ended();
  });

  return {
    update: () => instance.rerender(createElement(Frame)),
    destroy: () => {
      destroyed = true;
      instance.unmount();
    },
  };
};
