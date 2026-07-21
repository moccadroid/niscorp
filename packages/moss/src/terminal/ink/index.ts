import { createElement, useRef, type FC, type ReactNode } from 'react';
import { render, Text as InkText, useFocusManager, useInput } from 'ink';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import {
  defaultRegistry,
  fallback as inkFallback,
  TextWrap,
  ErrorMarker,
  CanvasMarkersContext,
  FrameControlsContext,
  markerFocusId,
} from '@niscorp/nova/adapters/ink';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import { defaultRegistry as ttyRegistry, fallback as ttyFallback } from '@niscorp/nova/adapters/tty/components';
import type { ComponentRegistry } from '@niscorp/nova';
import type { WireStatus } from '../../client';
import type { Target } from '../index';
import { TerminalApiContext, registerWireSlots } from '../react/slots';
import type { TerminalSlotWrapper } from '../react/slots';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/ink — the full-screen terminal render target: nova's
// Ink kit on the React adapter's walker, mounted with ink's renderer.
//
// Interaction is the TTY REPL's numbered addressing plus live focus: every
// interactive shows a `[n]` marker, and TYPED DIGITS act on it — a button or
// row clicks, a toggle flips, an input takes focus (then typing types; a
// focused input claims digits as text, so number navigation stands down).
// The numbering comes from the TTY adapter's walker run over the SAME served
// trees — one source of truth, so `[7]` is the same thing in the REPL and
// the TUI. Tab/Shift+Tab and ↑/↓ still walk the focus ring; Enter activates;
// Ctrl+C leaves. ESM only, like ink. Node-shaped and react-shaped code lives
// here, never in moss core.
// ═══════════════════════════════════════════════════════════

export type InkTargetConfig = {
  // the app's Ink kit; omit for nova's default (floor kit + fallback)
  registry?: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  // the wire's connection state, when the host can supply it — rendered as a
  // dim line while not open (a blank full-screen app on a dead socket is
  // indistinguishable from a working empty one)
  status?: () => WireStatus;
  // called when the ink app exits (Ctrl+C) — the host owns the wire/process
  onQuit?: () => void;
};

// How long a typed digit waits for another before acting — only when a
// longer number is still possible ('1' with 14 interactives on screen).
const DIGIT_COMMIT_MS = 600;

export const inkTarget = (config: InkTargetConfig = {}): Target => (api) => {
  const registry = config.registry ?? defaultRegistry();

  // ── the marker table: the TTY walker over the same trees ──
  // Pure and cheap; rebuilt at the top of every frame render. Identity for
  // lookup is (canvas, ref, occurrence) — occurrence disambiguates a table's
  // rows, which share one rowRef in row order.
  const indexView = createTtyView(ttyRegistry(), api, { fallback: ttyFallback });
  const marks = { list: [] as TtyInteractive[], byKey: new Map<string, TtyInteractive>() };
  const reindex = (): void => {
    marks.list = indexView.render().interactives;
    marks.byKey.clear();
    const seen = new Map<string, number>();
    for (const item of marks.list) {
      const base = `${item.canvas}:${item.ref}`;
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      marks.byKey.set(`${base}#${occurrence}`, item);
      // click-kinds carry a stable payload — a list's rows share one ref and
      // differ only by value, so value IS the identity there. Model-kinds'
      // value changes as you type; they stay occurrence-keyed.
      if ((item.kind === 'click' || item.kind === 'row') && item.value !== undefined) {
        marks.byKey.set(`${base}@${JSON.stringify(item.value)}`, item);
      }
    }
  };

  // ink resolves markers per canvas — the slot's canvasProvider curries it.
  const CanvasMarkers: FC<{ canvasId: string; children?: ReactNode }> = ({ canvasId, children }) =>
    createElement(
      CanvasMarkersContext.Provider,
      {
        value: (ref: string, identity: { value?: unknown; occurrence?: number } = {}) => {
          const base = `${canvasId}:${ref}`;
          if (identity.value !== undefined) {
            const byValue = marks.byKey.get(`${base}@${JSON.stringify(identity.value)}`);
            if (byValue !== undefined) return byValue.index;
          }
          return marks.byKey.get(`${base}#${identity.occurrence ?? 0}`)?.index;
        },
      },
      children,
    );

  registerWireSlots(registry, {
    slotWrapper: config.slotWrapper,
    fallback: inkFallback,
    textWrapper: TextWrap,
    errorMarker: ErrorMarker,
    canvasProvider: CanvasMarkers,
  });

  // A focused input claims typed digits as text — the kit's Input reports
  // its focus through FrameControls and Nav stands down.
  const typingRef = { current: false };
  const frameControls = { setTyping: (typing: boolean): void => void (typingRef.current = typing) };

  // ↑/↓ walk the focus ring; typed digits address `[n]` directly — click a
  // button or row, flip a toggle, focus an input. Multi-digit numbers
  // accumulate; an unambiguous one acts immediately.
  const Nav: FC = () => {
    const { focus, focusNext, focusPrevious } = useFocusManager();
    const buffer = useRef('');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const clearBuffer = (): void => {
      buffer.current = '';
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        timer.current = undefined;
      }
    };
    const commit = (): void => {
      const index = Number(buffer.current);
      clearBuffer();
      const item = marks.list.find((entry) => entry.index === index);
      if (item === undefined || item.canvas === '') return;
      // focus follows the number for every kind — visible feedback, and for
      // an input the focus IS the action (typing types from here on)
      focus(markerFocusId(index));
      if (item.kind === 'toggle') api.dispatch(item.canvas, { type: 'ui:model', ref: item.ref, payload: item.value !== true });
      else if (item.kind !== 'model')
        api.dispatch(item.canvas, item.value === undefined ? { type: 'ui:click', ref: item.ref } : { type: 'ui:click', ref: item.ref, payload: item.value });
    };
    useInput((input, key) => {
      // While an input is focused, vertical arrows belong to it (it forwards
      // them to the server as ui:key — a palette moves its highlight).
      if (key.downArrow) {
        if (!typingRef.current) focusNext();
        return;
      }
      if (key.upArrow) {
        if (!typingRef.current) focusPrevious();
        return;
      }
      if (typingRef.current) return;
      if (/^[0-9]$/.test(input) && !key.ctrl && !key.meta) {
        buffer.current += input;
        if (timer.current !== undefined) clearTimeout(timer.current);
        // no longer number is possible → act now; otherwise wait a beat
        if (Number(buffer.current) * 10 > marks.list.length) commit();
        else timer.current = setTimeout(commit, DIGIT_COMMIT_MS);
        return;
      }
      if (buffer.current !== '') clearBuffer();
    });
    return null;
  };

  const StatusLine: FC = () => {
    const status = config.status?.();
    if (status === undefined || status === 'open') return null;
    return status === 'connecting'
      ? createElement(InkText, { color: 'yellow' }, '… connecting')
      : createElement(InkText, { color: 'red' }, '× connection lost — retrying');
  };

  const Frame: FC = () => {
    reindex();
    return createElement(
      FrameControlsContext.Provider,
      { value: frameControls },
      createElement(
        TerminalApiContext.Provider,
        { value: api },
        createElement(
          NovaRenderProvider,
          {
            registry,
            // the frame is chrome — app events flow only from inside a canvas
            dispatch: () => undefined,
            publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
            fallback: inkFallback,
            textWrapper: TextWrap,
            errorMarker: ErrorMarker,
          },
          createElement(Nav),
          createElement(StatusLine),
          createElement(RenderTree, { nodes: api.frame() }),
        ),
      ),
    );
  };

  const instance = render(createElement(Frame), {
    ...(config.stdout !== undefined ? { stdout: config.stdout } : {}),
    ...(config.stdin !== undefined ? { stdin: config.stdin } : {}),
    exitOnCtrlC: true,
    patchConsole: true,
  });
  void instance.waitUntilExit().then(() => config.onQuit?.());

  // The conductor drives re-render: each `update` re-reads api.frame() and
  // the canvas trees, and React reconciles (focus survives by node key).
  return {
    update: () => instance.rerender(createElement(Frame)),
    destroy: () => instance.unmount(),
  };
};
