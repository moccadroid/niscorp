import React, { Children, useContext, useEffect, useRef, useState, type FC } from 'react';
import { Box as InkBox, Text as InkText, Transform, useFocus, useInput } from 'ink';
import TextInput from 'ink-text-input';
// The public self-name, NOT the internal `@react` alias — this import must
// stay external in the bundle so the ink kit shares the react adapter's
// context instance with its host (see tsup.config).
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { str, num, bool, iconGlyph, truncate, pad } from '../tty/components/props';
import { at, cellText, columnsOf, cellKey, JsonTree as renderJsonLines } from '../tty/components/components';
import { useMarker, markerFocusId, Mark, FrameControlsContext } from './markers';

// useFocus options: adopt the marker index as the focus id when one is
// resolved, so the host can jump focus by typed number.
const focusOpts = (active: boolean, marker: number | undefined): { isActive: boolean; id?: string } => ({
  isActive: active,
  ...(marker !== undefined ? { id: markerFocusId(marker) } : {}),
});

// The shared interactive treatment for anything `ref`'d — leaf or container:
// marker (value-identified, so a list's rows sharing one ref each get their
// own number), focus-ring membership, Enter → ui:click with the payload.
// Exported: an app's own ink components get the full convention from this
// one hook.
export const useActionable = (novaRef: string | undefined, value: unknown): { marker: number | undefined; isFocused: boolean } => {
  const dispatch = useNovaDispatch();
  const marker = useMarker(novaRef, value !== undefined ? { value } : undefined);
  const { isFocused } = useFocus(focusOpts(novaRef !== undefined, marker));
  useInput(
    (_input, key) => {
      if (novaRef === undefined || !key.return) return;
      dispatch(value === undefined ? { type: 'ui:click', ref: novaRef } : { type: 'ui:click', ref: novaRef, payload: value });
    },
    { isActive: isFocused && novaRef !== undefined },
  );
  return { marker, isFocused };
};

// A ref'd container renders behind an action gutter: its marker + focus caret.
const actionGutter = (marker: number | undefined, isFocused: boolean, body: React.ReactNode): React.ReactElement => (
  <InkBox flexDirection="row" gap={1}>
    <InkText color="cyan" dimColor={!isFocused}>
      {marker !== undefined ? `[${marker}]` : ''}
      {isFocused ? '▸' : ''}
    </InkText>
    {body}
  </InkBox>
);

// ═══════════════════════════════════════════════════════════
// The Ink reference kit — the same domain-blind vocabulary as the DOM and
// TTY kits (same names, same props), rendered full-screen: Tab cycles focus
// (ink's built-in focus manager), Enter/Space activates, typing types. The
// kit rides the React adapter's walker — an Ink component IS a NovaComponent
// — so dispatch, model injection, and slot semantics arrive through the same
// provider the browser uses. What a terminal can't do it doesn't fake.
// ═══════════════════════════════════════════════════════════

type P = Record<string, unknown>;

// The walker's host-specific leaf renderers (NovaRenderProvider props): ink
// forbids bare strings outside <Text>, so served text nodes and error nodes
// both need ink-shaped leaves — the DOM defaults crash the whole render.
export const TextWrap: FC<{ children?: React.ReactNode }> = ({ children }) => <InkText>{children}</InkText>;
export const ErrorMarker: FC<{ code: string; message: string }> = ({ code, message }) => (
  <InkText color="red">{`[${code}] ${message}`}</InkText>
);

const heavy = (p: P): boolean => {
  const weight = p['weight'];
  return (typeof weight === 'number' && weight >= 600) || weight === 'semibold' || weight === 'bold';
};
const mutedColor = (p: P): boolean => ['mute', 'muted', 'dim', 'secondary'].includes(str(p, 'color') ?? '');
// px gaps from layouts → terminal rows: only a deliberate gap earns a blank line
const gapRows = (p: P): number => ((num(p, 'gap') ?? 0) >= 12 ? 1 : 0);

// Layout px → terminal cells, the one unit conversion the kit makes (~8px per
// character cell). Percent strings pass straight through to yoga.
const CELL_PX = 8;
const toWidth = (value: unknown): number | string | undefined =>
  typeof value === 'string' ? value : typeof value === 'number' ? Math.max(2, Math.round(value / CELL_PX)) : undefined;

const JUSTIFY = {
  start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around',
} as const;
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const;

// The box vocabulary every container honors: side borders become rules (the
// sidebar's divider), padding becomes a cell of breathing room, widths map
// px→cells, `grow` fills. What has no terminal analog (bg, radius, glow) is
// simply absent.
const boxProps = (p: P): Record<string, unknown> => {
  const border = p['border'];
  const width = toWidth(p['w'] ?? p['width']);
  const pad = num(p, 'p') ?? num(p, 'padding');
  return {
    ...(border === true ? { borderStyle: 'single', borderDimColor: true } : {}),
    ...(typeof border === 'string'
      ? {
          borderStyle: 'single',
          borderDimColor: true,
          borderTop: border === 't',
          borderBottom: border === 'b',
          borderLeft: border === 'l',
          borderRight: border === 'r',
        }
      : {}),
    ...(width !== undefined ? { width } : {}),
    ...((pad ?? 0) > 0 || num(p, 'px') !== undefined ? { paddingX: 1 } : {}),
    ...(bool(p, 'grow') ? { flexGrow: 1 } : {}),
  };
};

// ── containers — every one honors `ref` (an app's clickable rows are often
// ref'd Grids/Boxes; the browser wires them by convention, so must we) ──
export const Box: NovaComponent = ({ children, novaRef, ...rest }) => {
  const { marker, isFocused } = useActionable(novaRef, rest['value']);
  const body = <InkBox flexDirection="column" {...boxProps(rest)}>{children}</InkBox>;
  return novaRef === undefined ? body : actionGutter(marker, isFocused, body);
};
export const Stack: NovaComponent = ({ children, novaRef, ...rest }) => {
  const { marker, isFocused } = useActionable(novaRef, rest['value']);
  const body = <InkBox flexDirection="column" gap={gapRows(rest)} {...boxProps(rest)}>{children}</InkBox>;
  return novaRef === undefined ? body : actionGutter(marker, isFocused, body);
};
export const Row: NovaComponent = ({ children, novaRef, ...rest }) => {
  const { marker, isFocused } = useActionable(novaRef, rest['value']);
  const justify = JUSTIFY[(str(rest, 'justify') ?? '') as keyof typeof JUSTIFY];
  const align = ALIGN[(str(rest, 'align') ?? '') as keyof typeof ALIGN];
  const body = (
    <InkBox
      flexDirection="row"
      gap={1}
      {...(justify !== undefined ? { justifyContent: justify, width: '100%' } : {})}
      {...(align !== undefined ? { alignItems: align } : {})}
      {...boxProps(rest)}
    >
      {children}
    </InkBox>
  );
  return novaRef === undefined ? body : actionGutter(marker, isFocused, body);
};

// The grid honors `weights` ([3,1] → flex ratios) and `columns` (N equal
// tracks, wrapping) by wrapping each child in its own flex cell — this is
// what lines a settings page's label/control columns up.
export const Grid: NovaComponent = ({ children, novaRef, ...rest }) => {
  const { marker, isFocused } = useActionable(novaRef, rest['value']);
  const rawWeights = rest['weights'];
  const weights = Array.isArray(rawWeights) ? rawWeights.map((w) => (typeof w === 'number' ? w : 1)) : undefined;
  const columns = num(rest, 'columns');
  const items = Children.toArray(children);

  const body =
    weights !== undefined ? (
      <InkBox flexDirection="row" gap={1} width="100%" {...boxProps(rest)}>
        {items.map((child, i) => (
          <InkBox key={i} flexDirection="column" flexBasis={0} flexGrow={weights[i % weights.length] ?? 1}>
            {child}
          </InkBox>
        ))}
      </InkBox>
    ) : columns !== undefined && columns > 0 ? (
      <InkBox flexDirection="row" flexWrap="wrap" width="100%" {...boxProps(rest)}>
        {items.map((child, i) => (
          <InkBox key={i} flexDirection="column" width={`${Math.floor(100 / columns)}%`}>
            {child}
          </InkBox>
        ))}
      </InkBox>
    ) : (
      <InkBox flexDirection="row" gap={2} {...boxProps(rest)}>{children}</InkBox>
    );
  return novaRef === undefined ? body : actionGutter(marker, isFocused, body);
};

const TEXT_COLOR: Record<string, string> = {
  accent: 'cyan', success: 'green', positive: 'green', danger: 'red', error: 'red', warning: 'yellow',
};

export const Text: NovaComponent = ({ children, ...rest }) => {
  if (children === undefined || children === null) return null;
  const body = bool(rest, 'upper') ? <Transform transform={(s) => s.toUpperCase()}>{children}</Transform> : children;
  const tone = TEXT_COLOR[str(rest, 'color') ?? ''];
  return (
    <InkText bold={heavy(rest)} dimColor={mutedColor(rest)} {...(tone !== undefined ? { color: tone } : {})}>{body}</InkText>
  );
};

export const Badge: NovaComponent = ({ children }) =>
  children === undefined || children === null ? null : <InkText inverse> {children} </InkText>;

// ── controls ──
export const Button: NovaComponent = ({ children, novaRef, ...rest }) => {
  const { marker, isFocused } = useActionable(novaRef, rest['value']);
  const icon = str(rest, 'icon');
  const label = Children.count(children) > 0 ? children : icon !== undefined ? iconGlyph(icon) : '';
  // flexShrink 0: a squeezed row truncates a button, never wraps it mid-parens
  return (
    <InkBox flexShrink={0}>
      <InkText>
        <Mark index={marker} />
        <InkText inverse={isFocused}>( {label} )</InkText>
      </InkText>
    </InkBox>
  );
};

// The bound input — both remote round-trip obligations (ADAPTER.md §6) hold
// here exactly as in the browser kit: a local draft while focused so the
// async tree echo can't clobber mid-typing, and the `debounce` prop
// coalescing keystrokes. Enter flushes and sends `ui:key Enter` (a served
// form's submit-on-enter works unchanged).
export const Input: NovaComponent = ({ novaModel, ...rest }) => {
  const dispatch = useNovaDispatch();
  const marker = useMarker(novaModel?.ref);
  const { isFocused } = useFocus(focusOpts(novaModel !== undefined, marker));
  // A focused input claims typed digits as text — the host's number
  // navigation stands down while this is set.
  const controls = useContext(FrameControlsContext);
  useEffect(() => {
    controls?.setTyping(isFocused);
    return () => {
      if (isFocused) controls?.setTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus edge only
  }, [isFocused]);
  const raw = rest['value'];
  const server = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  const [draft, setDraft] = useState<string | null>(null);
  const debounceMs = num(rest, 'debounce') ?? 0;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fire = (next: string): void => {
    if (novaModel !== undefined) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: next });
  };
  const clearPending = (): void => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };
  useEffect(() => clearPending, []);

  // Focus edges: entering starts a draft from the server value; leaving
  // flushes any pending keystroke and hands authority back to the server.
  useEffect(() => {
    if (isFocused) setDraft((current) => current ?? server);
    else
      setDraft((current) => {
        if (current !== null && timer.current !== undefined) {
          clearPending();
          fire(current);
        }
        return null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus edge only
  }, [isFocused]);

  // Vertical arrows forward to the server as ui:key while focused — a
  // served palette moves its highlight with them, exactly as in the browser.
  useInput(
    (_input, key) => {
      if (novaModel === undefined) return;
      if (key.downArrow) dispatch({ type: 'ui:key', ref: novaModel.ref, key: 'ArrowDown' });
      else if (key.upArrow) dispatch({ type: 'ui:key', ref: novaModel.ref, key: 'ArrowUp' });
    },
    { isActive: isFocused && novaModel !== undefined },
  );

  const onChange = (next: string): void => {
    setDraft(next);
    if (debounceMs > 0) {
      clearPending();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        fire(next);
      }, debounceMs);
    } else fire(next);
  };
  const onSubmit = (next: string): void => {
    // flush only what hasn't fired yet — undebounced keystrokes already did
    if (timer.current !== undefined) {
      clearPending();
      fire(next);
    }
    if (novaModel !== undefined) dispatch({ type: 'ui:key', ref: novaModel.ref, key: 'Enter' });
  };

  return (
    <InkBox>
      <Mark index={marker} />
      <InkText dimColor>⟨</InkText>
      <TextInput
        value={draft ?? server}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={str(rest, 'placeholder') ?? ''}
        focus={isFocused}
        {...(str(rest, 'type') === 'password' ? { mask: '•' } : {})}
      />
      <InkText dimColor>⟩</InkText>
    </InkBox>
  );
};

export const Checkbox: NovaComponent = ({ novaModel, ...rest }) => {
  const dispatch = useNovaDispatch();
  const marker = useMarker(novaModel?.ref);
  const { isFocused } = useFocus(focusOpts(novaModel !== undefined, marker));
  const checked = bool(rest, 'value') || bool(rest, 'checked');
  useInput(
    (input, key) => {
      if (novaModel === undefined || (!key.return && input !== ' ')) return;
      dispatch({ type: 'ui:model', ref: novaModel.ref, payload: !checked });
    },
    { isActive: isFocused && novaModel !== undefined },
  );
  return (
    <InkText>
      <Mark index={marker} />
      <InkText inverse={isFocused} {...(checked ? { color: 'green' } : {})}>{checked ? '☑' : '☐'}</InkText>
    </InkText>
  );
};

// ── the data-driven table: same data contract as the DOM/TTY tables, each
// row a focusable line dispatching `rowRef` with row[clickKey] on Enter.
const CELL_CAP = 28;

const TableRow: FC<{ line: string; refId?: string; payload?: unknown; occurrence: number }> = ({ line, refId, payload, occurrence }) => {
  const dispatch = useNovaDispatch();
  // rows share one rowRef — the payload is the identity (occurrence backstop)
  const marker = useMarker(refId, { value: payload, occurrence });
  const { isFocused } = useFocus(focusOpts(refId !== undefined, marker));
  useInput(
    (_input, key) => {
      if (refId === undefined || !key.return) return;
      dispatch(payload === undefined ? { type: 'ui:click', ref: refId } : { type: 'ui:click', ref: refId, payload });
    },
    { isActive: isFocused && refId !== undefined },
  );
  return (
    <InkText>
      <Mark index={marker} />
      <InkText inverse={isFocused}>{line}</InkText>
    </InkText>
  );
};

export const Table: NovaComponent = ({ ...rest }) => {
  const columns = columnsOf(rest);
  const rows = Array.isArray(rest['rows']) ? rest['rows'] : [];
  const rowKey = str(rest, 'rowKey') ?? 'id';
  const clickKey = str(rest, 'clickKey') ?? rowKey;
  const rowRef = str(rest, 'rowRef');

  if (rows.length === 0) return <InkText dimColor>{str(rest, 'empty') ?? 'Nothing here.'}</InkText>;

  const header = columns.map((column) => (typeof column.label === 'string' ? column.label : ''));
  const body = rows.map((row) => columns.map((column) => truncate(cellText(at(row, cellKey(column))), CELL_CAP)));
  const widths = header.map((label, i) => Math.max(truncate(label, CELL_CAP).length, ...body.map((cells) => cells[i]?.length ?? 0)));
  const line = (cells: string[]): string => cells.map((cell, i) => pad(cell, widths[i] ?? 0)).join('  ').trimEnd();

  return (
    <InkBox flexDirection="column">
      <InkText dimColor>{line(header)}</InkText>
      <InkText dimColor>{line(widths.map((width) => '─'.repeat(width)))}</InkText>
      {rows.map((row, i) => (
        <TableRow
          key={String(at(row, rowKey) ?? i)}
          line={line(body[i] ?? [])}
          occurrence={i}
          {...(rowRef !== undefined ? { refId: rowRef, payload: at(row, clickKey) } : {})}
        />
      ))}
    </InkBox>
  );
};

// ── introspection primitives ──
const HeaderButton: FC<{ glyph: string; refId: string }> = ({ glyph, refId }) => {
  const dispatch = useNovaDispatch();
  const marker = useMarker(refId);
  const { isFocused } = useFocus(focusOpts(true, marker));
  useInput(
    (input, key) => {
      if (key.return || input === ' ') dispatch({ type: 'ui:click', ref: refId });
    },
    { isActive: isFocused },
  );
  return (
    <InkText>
      <Mark index={marker} />
      <InkText inverse={isFocused}>{glyph}</InkText>
    </InkText>
  );
};

export const Panel: NovaComponent = ({ children, ...rest }) => {
  const title = str(rest, 'title');
  const backRef = str(rest, 'backRef');
  const closeRef = str(rest, 'closeRef');
  return (
    <InkBox flexDirection="column" borderStyle="round" paddingX={1}>
      {title !== undefined && (
        <InkBox gap={1}>
          {backRef !== undefined && <HeaderButton glyph="←" refId={backRef} />}
          <InkText bold>{title}</InkText>
          {closeRef !== undefined && <HeaderButton glyph="✕" refId={closeRef} />}
        </InkBox>
      )}
      {children}
    </InkBox>
  );
};

// JsonTree reuses the TTY renderer verbatim — it is a pure lines function,
// and static depth-capped output is exactly right for a TUI too.
export const JsonTree: NovaComponent = ({ ...rest }) => {
  const block = renderJsonLines({ props: rest, children: [], register: () => 0 });
  return (
    <InkBox flexDirection="column">
      {block.lines.map((textLine, i) => (
        <InkText key={i}>{textLine}</InkText>
      ))}
    </InkBox>
  );
};

// The per-instance boundary marker a flattened shell tree carries — the Ink
// target has no wrapper concept of its own; moss's terminal overrides this
// with the wire-backed slot when a slotWrapper is in play.
export const ActionSlot: NovaComponent = ({ children }) => <InkBox flexDirection="column">{children}</InkBox>;

// Unmapped primitives render their children; childless ones surface their
// primary text prop plus a `count` — the same legible degrade as the DOM
// and TTY fallbacks. A `ref`'d unknown (an app's NavItem) is focusable and
// clicks on Enter — the walker marks refs universally in the TTY adapter,
// so the ink fallback must carry the same convention itself or an app's
// custom chrome renders dead.
export const fallback: NovaComponent = ({ children, novaRef, ...rest }) => {
  const { marker, isFocused } = useActionable(novaRef, rest['value']);

  if (Children.count(children) > 0) {
    if (novaRef === undefined) return <InkBox flexDirection="column">{children}</InkBox>;
    return actionGutter(marker, isFocused, <InkBox flexDirection="column">{children}</InkBox>);
  }
  const label = str(rest, 'label') ?? str(rest, 'title');
  if (label === undefined) return null;
  const count = rest['count'];
  const suffix = typeof count === 'number' || (typeof count === 'string' && count !== '') ? ` (${String(count)})` : '';
  return (
    <InkText>
      <Mark index={marker} />
      <InkText inverse={isFocused}>
        {label}
        {suffix}
      </InkText>
    </InkText>
  );
};
