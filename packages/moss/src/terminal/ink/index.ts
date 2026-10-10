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

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/ink — the full-screen terminal render target: nova's
// Ink kit on the React adapter's walker, mounted with ink's renderer.
//
// Interaction is the TTY REPL's numbered addressing plus live focus: every
// interactive shows a `[n]` marker, and TYPED DIGITS act on it — a button or
// row clicks, a toggle flips, an input takes focus (then typing types; a
// focused input claims digits as text, so number navigation stands down).
// The numbering comes from the TTY adapter's walker run over the SAME served
// trees (./marks.ts), and what a number sends is the REPL's (../numbered.ts).
// Tab/Shift+Tab and ↑/↓ still walk the focus ring (./nav.ts); Enter
// activates; Ctrl+C leaves. ESM only, like ink. Node-shaped and react-shaped
// code lives here, never in moss core.
// ═══════════════════════════════════════════════════════════

export type InkTargetConfig = {
  // the app's Ink kit; omit for nova's default (floor kit + fallback)
  registry?: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  // called when the ink app exits (Ctrl+C) — the host owns the wire/process
  onQuit?: () => void;
  // Route the process's console output above the frame (ink's patchConsole).
  // Default on — right for one terminal owning its process. A host rendering
  // SEVERAL ink targets in one process (an SSH server, one per connection)
  // turns it off: the console is the process's, and patching it would hand
  // the server's own logs to whoever is connected.
  patchConsole?: boolean;
};

// The connection's status, as a line for as long as it is not open: a blank
// full-screen app on a dead socket is indistinguishable from a working empty
// one.
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

  // A focused input claims typed digits as text — the kit's Input reports
  // its focus through FrameControls and Nav stands down.
  const typingRef = { current: false };
  const frameControls = { setTyping: (typing: boolean): void => void (typingRef.current = typing) };
  const Nav = navOf({ api, marks, typing: () => typingRef.current });
  const StatusLine = statusLineOf(api.status);

  // Nav and the status line read nothing of nova's: they sit beside the frame,
  // which is the one every react-shaped target draws (../react/frame).
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
  // A quit (Ctrl+C) is the person leaving, and the host's to hear: it owns the
  // wire and the process. A destroy is the host's own doing (a swap, a
  // connection it is closing), and it is not told of what it did itself.
  let destroyed = false;
  void instance.waitUntilExit().then(() => {
    if (!destroyed) config.onQuit?.();
  });

  // The conductor drives re-render: each `update` re-reads api.frame() and
  // the canvas trees, and React reconciles (focus survives by node key).
  return {
    update: () => instance.rerender(createElement(Frame)),
    destroy: () => {
      destroyed = true;
      instance.unmount();
    },
  };
};
