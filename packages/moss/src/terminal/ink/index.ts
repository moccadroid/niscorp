import { createElement, useRef, type FC, type ReactNode } from 'react';
import { CanvasMarkersContext, ErrorMarker, FrameControlsContext, TextWrap, defaultRegistry, fallback as inkFallback, markerFocusId } from '@niscorp/nova/adapters/ink';
import type { MarkerResolve } from '@niscorp/nova/adapters/ink';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import { defaultRegistry as ttyRegistry, fallback as ttyFallback } from '@niscorp/nova/adapters/tty/components';
import { Text as InkText, render, useFocusManager, useInput } from 'ink';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import type { Target, TerminalApi } from '../index';
import { STATUS_WORDS, sendFrom, tapEventOf } from '../targets';
import { registerWireSlots, terminalFrame } from '../react/slots';
import type { TerminalSlotWrapper } from '../react/slots';

type Marks = {
  reindex: () => void;
  count: () => number;
  at: (index: number) => TtyInteractive | undefined;
  resolverFor: (canvasId: string, instanceId: string) => MarkerResolve;
};

const createMarks = (api: TerminalApi): Marks => {
  const indexView = createTtyView(ttyRegistry(), api, { fallback: ttyFallback });
  let list: TtyInteractive[] = [];
  const byKey = new Map<string, TtyInteractive>();
  return {
    reindex: () => {
      list = indexView.render().interactives;
      byKey.clear();
      const seen = new Map<string, number>();
      for (const item of list) {
        // By canvas, instance and ref, then by occurrence: the instances of a list canvas share refs,
        // and a table's rows share one ref in row order.
        const base = `${item.canvas}:${item.origin ?? ''}:${item.ref}`;
        const occurrence = seen.get(base) ?? 0;
        seen.set(base, occurrence + 1);
        byKey.set(`${base}#${occurrence}`, item);
        // A click's or a row's value does not change, so it is a key too. An input's changes as it is typed.
        if ((item.kind === 'click' || item.kind === 'row') && item.value !== undefined) {
          byKey.set(`${base}@${JSON.stringify(item.value)}`, item);
        }
      }
    },
    count: () => list.length,
    at: (index) => list.find((entry) => entry.index === index),
    resolverFor: (canvasId, instanceId) => (ref, identity = {}) => {
      const base = `${canvasId}:${instanceId}:${ref}`;
      if (identity.value !== undefined) {
        const byValue = byKey.get(`${base}@${JSON.stringify(identity.value)}`);
        if (byValue !== undefined) return byValue.index;
      }
      return byKey.get(`${base}#${identity.occurrence ?? 0}`)?.index;
    },
  };
};

const markerProviders = (
  marks: Marks,
): {
  canvasProvider: FC<{ canvasId: string; children?: ReactNode }>;
  instanceProvider: FC<{ canvasId: string; instanceId: string; children?: ReactNode }>;
} => ({
  canvasProvider: ({ canvasId, children }) => createElement(CanvasMarkersContext.Provider, { value: marks.resolverFor(canvasId, '') }, children),
  instanceProvider: ({ canvasId, instanceId, children }) => createElement(CanvasMarkersContext.Provider, { value: marks.resolverFor(canvasId, instanceId) }, children),
});

const DIGIT_COMMIT_MS = 600;

const navOf = (deps: {
  api: TerminalApi;
  marks: Marks;
  typing: () => boolean;
}): FC => {
  const { api, marks, typing } = deps;
  return () => {
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
      const item = marks.at(index);
      if (item === undefined || item.canvas === '') return;
      focus(markerFocusId(index));
      const event = tapEventOf(item);
      if (event !== undefined) sendFrom(api, item, event);
    };
    useInput((input, key) => {
      if (key.downArrow) {
        if (!typing()) focusNext();
        return;
      }
      if (key.upArrow) {
        if (!typing()) focusPrevious();
        return;
      }
      if (typing()) return;
      // Several digits can arrive as one read (a slow link, a paste).
      if (/^[0-9]+$/.test(input) && !key.ctrl && !key.meta) {
        buffer.current += input;
        if (timer.current !== undefined) clearTimeout(timer.current);
        // At once when no longer number could name anything on screen.
        if (Number(buffer.current) * 10 > marks.count()) commit();
        else timer.current = setTimeout(commit, DIGIT_COMMIT_MS);
        return;
      }
      if (buffer.current !== '') clearBuffer();
    });
    return null;
  };
};

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
