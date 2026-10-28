import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent, type MouseEvent as TapEvent } from 'react';
import { z } from 'zod';
import { RenderTree, useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { RenderNode } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// A value a component does not take falls back to its default on its own; the others still hold.
const parsed = <S extends z.ZodRawShape>(schema: z.ZodObject<S>, props: Record<string, unknown>, fallback: z.output<z.ZodObject<S>>): z.output<z.ZodObject<S>> => {
  const taken = Object.fromEntries(
    Object.entries(props).filter(([key, value]) => {
      const field = schema.shape[key];
      return field !== undefined && z.safeParse(field, value).success;
    }),
  );
  const result = schema.safeParse({ ...fallback, ...taken });
  return result.success ? result.data : fallback;
};

const cell = (value: unknown): string => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

export const INKS = ['turn-1', 'turn-2', 'turn-3', 'turn-4', 'turn-5', 'screen-1', 'screen-2', 'screen-3'] as const;
const Ink = z.enum(INKS).describe('The ink: the turn of the answer that put it there, or the screen it is on.');
const Place = z.number().int().min(1).max(6);

const PageProps = z.object({}).describe('The page: a centred column with the app’s background.');
export const Page: NovaComponent = ({ children }) => <main className="k-page">{children}</main>;
Page.meta = { description: 'The page: a centred column.', propsSchema: PageProps };

const RowProps = z.object({
  tone: z.enum(['default', 'entry', 'controls', 'links', 'exchange']).optional().describe('default | entry: one entry of a list | controls: back, what is shown, forward | links: links to other screens | exchange: something asked, and what was said back'),
});
export const Row: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { tone } = parsed(RowProps, props, {});
  return <div className={tone === undefined || tone === 'default' ? 'k-row' : `k-row k-${tone}`}>{children}</div>;
};
Row.meta = { description: 'Children side by side.', propsSchema: RowProps };

const HeadingProps = z.object({}).describe('The page’s title.');
export const Heading: NovaComponent = ({ children }) => <h1 className="k-heading">{children}</h1>;
Heading.meta = { description: 'The page’s title.', propsSchema: HeadingProps };

const TextProps = z.object({
  tone: z
    .enum(['default', 'lead', 'muted', 'strong', 'display', 'right', 'wrong', 'error', 'title', 'meta', 'quote', 'tag', 'reply'])
    .optional()
    .describe(
      'default | lead: the sentence a card opens with | muted | strong | display: one big figure | right: a right answer, said | wrong: a wrong answer, said | error | title: what a picture shows | meta: where a thing stands, small | quote: words a person wrote | tag: what a thing in a list is, one word | reply: what the assistant said back, a sentence',
    ),
});
export const Text: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { tone } = parsed(TextProps, props, {});
  return <p className={tone === undefined || tone === 'default' ? 'k-text' : `k-text k-${tone}`}>{children}</p>;
};
Text.meta = { description: 'A paragraph.', propsSchema: TextProps };

const ARROWS = { back: 'M15 4.5 7.5 12l7.5 7.5', forward: 'M9 4.5 16.5 12 9 19.5', close: 'M6.5 6.5l11 11M17.5 6.5l-11 11' } as const;

const ButtonProps = z.object({
  label: z.string().optional().describe('What the button says; falls back to its children. With an icon, what it is called.'),
  tone: z
    .enum(['primary', 'suggestion', 'link', 'choice', 'chosen', 'right', 'wrong', 'asked'])
    .optional()
    .describe(
      'primary: what the action does | suggestion: a thing to ask | link: opens another screen | choice: one of a set to choose from | chosen: the one of the set that is chosen | right: the right one of a set, once picked | wrong: a wrong one, picked | asked: what the person said, in a conversation',
    ),
  icon: z.enum(['back', 'forward', 'close']).optional().describe('Drawn instead of the label: back | forward | close.'),
  current: z.boolean().optional().describe('Whether it is the one open now, of a set of links.'),
  disabled: z.boolean().optional().describe('Whether it can be pressed now.'),
  value: z.unknown().optional().describe('Sent with the click as its payload.'),
});
export const Button: NovaComponent = ({ children, novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { label, tone, icon, current, disabled, value } = parsed(ButtonProps, props, {});
  const kind = icon !== undefined ? 'step' : tone;
  return (
    <button
      type="button"
      className={kind === undefined || kind === 'primary' ? 'k-button' : `k-button k-${kind}`}
      aria-label={icon !== undefined ? label : undefined}
      aria-current={current === true ? 'page' : undefined}
      disabled={disabled === true}
      onClick={(event) => {
        event.stopPropagation();
        dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), ...(value !== undefined ? { payload: value } : {}) });
      }}
    >
      {icon !== undefined ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={ARROWS[icon]} />
        </svg>
      ) : (
        (label ?? children)
      )}
    </button>
  );
};
Button.meta = { description: 'A button; dispatches ui:click with its ref, and its value as the payload.', propsSchema: ButtonProps };

const ChipProps = z.object({
  label: z.string().describe('What is shown, in a few words.'),
  count: z.string().optional().describe('Where it stands, as “2/5”.'),
  ink: Ink.optional(),
});
export const Chip: NovaComponent = ({ novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { label, count, ink } = parsed(ChipProps, props, { label: '' });
  return (
    <button type="button" className="k-chip" data-ink={ink} onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}) })}>
      <span className="k-chip-title">{label}</span>
      {count !== undefined ? <span className="k-chip-count">{count}</span> : null}
    </button>
  );
};
Chip.meta = { description: 'Names what is shown and where it stands, in its ink; dispatches ui:click with its ref.', propsSchema: ChipProps };

const FrameProps = z.object({}).describe('The whole app: the answer, and the dock under it.');
export const Frame: NovaComponent = ({ children }) => <div className="k-frame">{children}</div>;
Frame.meta = { description: 'The whole app, top to bottom.', propsSchema: FrameProps };

// Its height is the page's to know, as `--dock-h`, so what opens above it stops at its top. Its `model` is given the
// time zone of the device it is drawn on.
const DockProps = z.object({
  ink: Ink.optional().describe('The ink of the answer it would ask for next.'),
  asking: z.boolean().optional().describe('Whether a question is being answered.'),
  error: z.boolean().optional().describe('Whether the last question got no screen.'),
});
export const Dock: NovaComponent = ({ children, novaRef: _ref, novaModel, ...props }) => {
  const { ink, asking, error } = parsed(DockProps, props, {});
  const dispatch = useNovaDispatch();
  const own = useRef<HTMLElement>(null);
  const zoned = novaModel?.ref;
  useEffect(() => {
    if (zoned !== undefined) dispatch({ type: 'ui:model', ref: zoned, payload: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }, [zoned, dispatch]);
  useEffect(() => {
    const element = own.current;
    if (element === null) return undefined;
    const root = document.documentElement;
    const measure = (): void => root.style.setProperty('--dock-h', `${element.offsetHeight}px`);
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(element);
    return () => {
      sizes.disconnect();
      root.style.removeProperty('--dock-h');
    };
  }, []);
  return (
    <footer ref={own} className="k-dock" data-ink={ink} data-asking={asking === true ? '' : undefined} data-error={error === true ? '' : undefined}>
      {children}
    </footer>
  );
};
Dock.meta = { description: 'What stays at the bottom, under the answer: the last layer, in the ink of the next answer.', propsSchema: DockProps };

const GridProps = z.object({
  columns: z.number().int().min(1).max(3).optional().describe('How many columns its areas are laid out in on a wide screen: 1 to 3.'),
  at: z.number().int().min(0).optional().describe('Where the answer it shows stands among the answers.'),
});
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Folded = { rows: string; open: string };

// The answer is one screen. Cards that fit share it; when they do not, every row folds to the strip its titles need but
// one, the row of the card tapped open or else of the first the answer changed, which takes the rest and scrolls inside
// itself. Tapping a folded card opens it.
const foldOf = (grid: HTMLElement, tapped: string | undefined): Folded | undefined => {
  const areas = [...grid.querySelectorAll<HTMLElement>(':scope > .k-area')].filter((area) => area.querySelector('.k-card') !== null);
  if (areas.length === 0) return undefined;
  const wide = matchMedia('(min-width: 721px)').matches;
  const rowOf = (area: HTMLElement, at: number): number => (wide ? Number(area.dataset['row'] ?? at + 1) : at + 1);
  const held = { rows: grid.style.getPropertyValue('--rows'), align: grid.style.alignContent, folded: grid.hasAttribute('data-folded') };
  const opened = areas.filter((area) => area.hasAttribute('data-open'));
  for (const area of opened) area.removeAttribute('data-open');
  grid.style.setProperty('--rows', 'none');
  grid.style.alignContent = 'start';
  grid.removeAttribute('data-folded');
  const fold = Number.parseFloat(getComputedStyle(grid).paddingTop) || 0;
  const natural = new Map<number, number>();
  areas.forEach((area, at) => natural.set(rowOf(area, at), Math.max(natural.get(rowOf(area, at)) ?? 0, area.offsetHeight - fold)));
  grid.setAttribute('data-folded', '');
  const strip = new Map<number, number>();
  areas.forEach((area, at) => {
    const title = area.querySelector<HTMLElement>('.k-card-title') ?? area.querySelector<HTMLElement>('.k-card > *');
    const reach = title === null ? area.offsetHeight : title.offsetTop + (Number.parseFloat(getComputedStyle(title).lineHeight) || title.offsetHeight);
    strip.set(rowOf(area, at), Math.max(strip.get(rowOf(area, at)) ?? 0, reach + fold * 0.5 + 8 - fold));
  });
  const room = grid.clientHeight - fold;
  grid.style.setProperty('--rows', held.rows);
  grid.style.alignContent = held.align;
  grid.toggleAttribute('data-folded', held.folded);
  for (const area of opened) area.setAttribute('data-open', '');
  const order = [...natural.keys()].sort((a, b) => a - b);
  if (order.reduce((sum, row) => sum + (natural.get(row) ?? 0), 0) <= room + 1) return undefined;
  const open = areas.find((area) => area.dataset['name'] === tapped) ?? areas.find((area) => area.dataset['fresh'] !== undefined) ?? areas[0];
  const openRow = open === undefined ? order[0] : rowOf(open, areas.indexOf(open));
  const folded = order.filter((row) => row !== openRow).reduce((sum, row) => sum + (strip.get(row) ?? 0), 0);
  const rows = order.map((row) => Math.round(row === openRow ? Math.max(strip.get(row) ?? 0, room - folded) : (strip.get(row) ?? 0)));
  return { rows: rows.map((row) => `${row}px`).join(' '), open: open?.dataset['name'] ?? '' };
};

export const Grid: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { columns, at } = parsed(GridProps, props, {});
  const own = useRef<HTMLElement>(null);
  const [folded, setFolded] = useState<Folded | undefined>(undefined);
  const [tapped, setTapped] = useState<string | undefined>(undefined);
  const [turning, setTurning] = useState(false);
  const lay = useRef<() => void>(() => undefined);
  lay.current = () => {
    const grid = own.current;
    if (grid === null) return;
    const next = foldOf(grid, tapped);
    for (const area of grid.querySelectorAll<HTMLElement>(':scope > .k-area')) area.toggleAttribute('data-open', next !== undefined && area.dataset['name'] === next.open);
    setFolded((was) => (was?.rows === next?.rows && was?.open === next?.open ? was : next));
  };
  useEffect(() => setTapped(undefined), [at]);
  useBeforePaint(() => lay.current());
  useEffect(() => {
    const grid = own.current;
    if (grid === null) return undefined;
    let queued = false;
    const soon = (): void => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        lay.current();
      });
    };
    const content = new MutationObserver(soon);
    content.observe(grid, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', soon);
    return () => {
      content.disconnect();
      window.removeEventListener('resize', soon);
    };
  }, []);
  useEffect(() => {
    if (!turning) return undefined;
    const done = setTimeout(() => setTurning(false), 520);
    return () => clearTimeout(done);
  }, [turning]);
  const onTap = (event: TapEvent<HTMLElement>): void => {
    const area = event.target instanceof Element ? event.target.closest<HTMLElement>('.k-grid > .k-area') : null;
    const name = area?.dataset['name'];
    if (folded === undefined || name === undefined || name === folded.open) return;
    event.preventDefault();
    event.stopPropagation();
    setTurning(true);
    setTapped(name);
  };
  return (
    <main
      ref={own}
      className="k-grid"
      data-columns={columns ?? 2}
      data-folded={folded === undefined ? undefined : ''}
      data-turning={turning ? '' : undefined}
      style={folded === undefined ? undefined : ({ '--rows': folded.rows } as CSSProperties)}
      onClickCapture={onTap}
    >
      {children}
    </main>
  );
};
Grid.meta = { description: 'Areas laid over each other, one under the next, on one screen: those that do not fit fold to their titles, and one is open; in columns on a wide screen.', propsSchema: GridProps };

const AreaProps = z.object({
  name: z.string().describe('Which canvas it holds.'),
  span: z.number().int().min(1).max(3).optional().describe('How many columns it takes.'),
  row: Place.optional().describe('Which row of its grid it is in.'),
  column: z.number().int().min(1).max(3).optional().describe('Which column of its grid it starts in.'),
  ink: Ink.optional(),
  fresh: z.enum(['changed', 'new']).optional().describe('What the answer shown did to it: changed what it holds, or put it where nothing was.'),
});
export const Area: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { name, span, row, column, ink, fresh } = parsed(AreaProps, props, { name: '' });
  return (
    <section className="k-area" data-name={name} data-span={span ?? 1} data-row={row} data-column={column} data-ink={ink} data-fresh={fresh}>
      {children}
    </section>
  );
};
Area.meta = { description: 'One area of an answer: a layer, its foot over the next.', propsSchema: AreaProps };

const CardProps = z.object({
  title: z.string().optional().describe('What the card shows, in a few words.'),
  tone: z.enum(['default', 'hero', 'log']).optional().describe('default | hero: the card a screen opens with | log: read from its foot, the newest last: it opens at the newest'),
});
// A log stays at its newest as lines come in.
export const Card: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { title, tone } = parsed(CardProps, props, {});
  const own = useRef<HTMLElement>(null);
  useEffect(() => {
    const card = own.current;
    if (tone !== 'log' || card === null) return undefined;
    const toEnd = (): void => {
      card.scrollTop = card.scrollHeight;
    };
    toEnd();
    const lines = new MutationObserver(() => requestAnimationFrame(toEnd));
    lines.observe(card, { childList: true, subtree: true });
    return () => lines.disconnect();
  }, [tone]);
  return (
    <article ref={own} className={tone === 'hero' ? 'k-card k-hero' : tone === 'log' ? 'k-card k-log' : 'k-card'}>
      {title !== undefined && title !== '' ? <h2 className="k-card-title">{title}</h2> : null}
      {children}
    </article>
  );
};
Card.meta = { description: 'One part of an answer, with its title.', propsSchema: CardProps };

const CodeProps = z.object({ text: z.string().describe('The code, as it is to be read.') });
export const Code: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { text } = parsed(CodeProps, props, { text: '' });
  return (
    <pre className="k-code">
      <code>{text}</code>
    </pre>
  );
};
Code.meta = { description: 'A block of code, kept as written.', propsSchema: CodeProps };

const PointsProps = z.object({ items: z.array(z.object({ title: z.string(), text: z.string() })).describe('Each point: a few words, and a sentence.') });
export const Points: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { items } = parsed(PointsProps, props, { items: [] });
  return (
    <dl className="k-points">
      {items.map((item) => (
        <div key={item.title} className="k-point">
          <dt>{item.title}</dt>
          <dd>{item.text}</dd>
        </div>
      ))}
    </dl>
  );
};
Points.meta = { description: 'A few points, each a few words and a sentence.', propsSchema: PointsProps };

const StepsProps = z.object({ items: z.array(z.string()).describe('The steps, in order.') });
export const Steps: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { items } = parsed(StepsProps, props, { items: [] });
  return (
    <ol className="k-steps">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
};
Steps.meta = { description: 'Steps in order, numbered.', propsSchema: StepsProps };

const CheckProps = z.object({
  label: z.string().describe('What is ticked off.'),
  checked: z.boolean().optional().describe('Whether it is ticked.'),
  value: z.unknown().optional().describe('Sent with the click as its payload.'),
});
export const Check: NovaComponent = ({ novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { label, checked, value } = parsed(CheckProps, props, { label: '' });
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === true}
      className={checked === true ? 'k-check k-checked' : 'k-check'}
      onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), ...(value !== undefined ? { payload: value } : {}) })}
    >
      <span className="k-box" aria-hidden="true" />
      <span className="k-check-label">{label}</span>
    </button>
  );
};
Check.meta = { description: 'A line to tick off; dispatches ui:click with its ref, and its value as the payload.', propsSchema: CheckProps };

const InputProps = z.object({
  placeholder: z.string().optional(),
  value: z.unknown().optional(),
  clearOnEnter: z.boolean().optional().describe('A line something is sent from: once Enter sends it, it empties as the shell takes it.'),
  tone: z.enum(['field', 'line']).optional().describe('field: a value in a form | line: the one line a person types into, large'),
});
// While it has focus, what is typed wins over what the shell echoes back, so a round trip to the server never takes a
// keystroke away. A line sent with Enter keeps its words until the shell empties it, so they are still there as they go.
// The line grows with what is typed; Shift and Enter start a new line in it.
export const Input: NovaComponent = ({ novaRef, novaModel, ...props }) => {
  const dispatch = useNovaDispatch();
  const { placeholder, value, clearOnEnter, tone } = parsed(InputProps, props, {});
  const [draft, setDraft] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = novaModel?.ref ?? novaRef;
  const echoed = cell(value);
  const emptied = sent && echoed === '';
  const shown = emptied ? '' : (draft ?? echoed);
  useEffect(() => {
    if (!emptied) return;
    setSent(false);
    setDraft(null);
  }, [emptied]);
  useBeforePaint(() => {
    const line = own.current;
    if (line === null) return;
    line.style.height = 'auto';
    line.style.height = `${line.scrollHeight}px`;
  }, [shown]);
  const onChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    setSent(false);
    setDraft(event.target.value);
    if (novaModel !== undefined) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: event.target.value });
  };
  // A line with nothing in it has nothing to send.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && event.shiftKey && tone === 'line') return;
    if (event.key === 'Enter' && tone === 'line') event.preventDefault();
    const sends = event.key === 'Enter' && clearOnEnter === true;
    if (sends && event.currentTarget.value.trim() === '') return;
    if (ref !== undefined) dispatch({ type: 'ui:key', ref, key: event.key });
    if (sends) setSent(true);
  };
  const common = { placeholder, value: shown, onChange, onKeyDown, onFocus: () => setDraft(echoed), onBlur: () => setDraft(null) };
  return tone === 'line' ? <textarea ref={own} className="k-input k-line" rows={1} {...common} /> : <input className="k-input" {...common} />;
};
Input.meta = { description: 'A field of text, bound to data with the node’s `model`; Enter is a ui:key. The line grows with what is typed.', propsSchema: InputProps };

const PromptProps = z.object({}).describe('The line to ask in.');
export const Prompt: NovaComponent = ({ children }) => <div className="k-prompt">{children}</div>;
Prompt.meta = { description: 'The line to ask in.', propsSchema: PromptProps };

const typedInto = (target: EventTarget | null): boolean => target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
const emptyField = (target: EventTarget | null): boolean => (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.value.trim() === '';

// A swipe to the right is the left arrow, pressed as soon as the finger is known to be going sideways, so the answer it
// goes to can follow the finger in; let go short of a quarter of the way, slowly, and the other arrow takes it back. On
// the page, `data-swiping` says which way a finger is carrying the answer and `--swipe-x` how far; `data-swiped` says
// how it was let go: commit or cancel.
const KeysProps = z.object({
  capture: z.boolean().optional().describe('Whether keys pressed while typing in a field count too; Enter only from a field with nothing in it.'),
  back: z.boolean().optional().describe('Whether there is anything to go back to; a swipe that way gives a little and springs back.'),
  forward: z.boolean().optional().describe('Whether there is anything to go forward to.'),
});
export const Keys: NovaComponent = ({ novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { capture, back, forward } = parsed(KeysProps, props, {});
  const press = useRef<(key: string) => void>(() => undefined);
  press.current = (key) => {
    if (novaRef !== undefined) dispatch({ type: 'ui:key', ref: novaRef, key });
  };
  const open = useRef({ back: back !== false, forward: forward !== false });
  open.current = { back: back !== false, forward: forward !== false };
  useEffect(() => {
    const root = document.documentElement;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (!['ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Delete'].includes(event.key)) return;
      if (capture !== true && typedInto(event.target) && !(event.key.startsWith('Arrow') && emptyField(event.target))) return;
      if ((event.key === 'Enter' || event.key === 'Delete') && ((typedInto(event.target) && !emptyField(event.target)) || (event.target instanceof Element && event.target.closest('button, a') !== null))) return;
      if (event.key.startsWith('Arrow')) event.preventDefault();
      press.current(event.key);
    };
    let swipe: { id: number; x: number; y: number; at: number; way?: 'back' | 'forward'; pressed: boolean } | undefined;
    const onDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' || !(event.target instanceof Element) || event.target.closest('button, a, input, textarea, .k-deck') !== null) return;
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), pressed: false };
    };
    const onMove = (event: PointerEvent): void => {
      if (swipe === undefined || event.pointerId !== swipe.id) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      if (swipe.way === undefined) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
          swipe = undefined;
          return;
        }
        if (Math.abs(dx) < 12) return;
        swipe.way = dx > 0 ? 'back' : 'forward';
        swipe.pressed = open.current[swipe.way];
        root.removeAttribute('data-swiped');
        root.setAttribute('data-swiping', swipe.way);
        if (swipe.pressed) press.current(swipe.way === 'back' ? 'ArrowLeft' : 'ArrowRight');
      }
      const carried = swipe.way === 'back' ? Math.max(0, dx) : Math.min(0, dx);
      root.style.setProperty('--swipe-x', String(swipe.pressed ? carried : carried * 0.25));
      root.style.setProperty('--swipe', String(Math.min(1, Math.abs(carried) / (window.innerWidth * 0.6))));
    };
    const onUp = (event: PointerEvent): void => {
      if (swipe === undefined || event.pointerId !== swipe.id) return;
      const { x, at, way, pressed } = swipe;
      swipe = undefined;
      if (way === undefined) return;
      const dx = (event.clientX - x) * (way === 'back' ? 1 : -1);
      const speed = dx / Math.max(1, performance.now() - at);
      const commit = pressed && event.type !== 'pointercancel' && (dx > window.innerWidth * 0.25 || speed > 0.5);
      root.removeAttribute('data-swiping');
      root.style.removeProperty('--swipe');
      root.setAttribute('data-swiped', commit ? 'commit' : 'cancel');
      if (pressed && !commit) press.current(way === 'back' ? 'ArrowRight' : 'ArrowLeft');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [capture]);
  return null;
};
Keys.meta = { description: 'Draws nothing: the arrow keys, Enter, Escape and Delete pressed on the page, and a sideways swipe, each sent as a ui:key with its ref.', propsSchema: KeysProps };

const valueOf = (element: Element | null | undefined): number | undefined => {
  const value = Number(element?.getAttribute('data-value'));
  return Number.isFinite(value) && element !== null && element !== undefined ? value : undefined;
};

// A finger scrolls it natively; a mouse drags it and a wheel turns it one picture at a time, by hand.
const DeckProps = z.object({ selected: z.number().optional().describe('The value of the picture picked.') });
export const Deck: NovaComponent = ({ children, novaModel, novaRef: _ref, ...props }) => {
  const dispatch = useNovaDispatch();
  const { selected } = parsed(DeckProps, props, {});
  const row = useRef<HTMLDivElement>(null);
  const picked = useRef(selected);
  const pick = useRef<(value: number) => void>(() => undefined);
  pick.current = (value) => {
    if (value === picked.current) return;
    picked.current = value;
    if (novaModel !== undefined) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: value });
  };
  const pictures = (): Element[] => [...(row.current?.children ?? [])];
  const centred = (): Element | undefined => {
    const scroller = row.current;
    if (scroller === null) return undefined;
    const middle = scroller.scrollLeft + scroller.clientWidth / 2;
    return pictures().reduce<{ element?: Element; off: number }>(
      (best, element) => {
        const box = element instanceof HTMLElement ? element : undefined;
        const off = box === undefined ? Infinity : Math.abs(box.offsetLeft + box.offsetWidth / 2 - middle);
        return off < best.off ? { element, off } : best;
      },
      { off: Infinity },
    ).element;
  };
  // While it is turned to a picture by hand, the pictures it passes on the way are not picked.
  const steering = useRef(false);
  const scrollTo = (value: number | undefined, smooth: boolean): void => {
    const scroller = row.current;
    const target = pictures().find((element) => valueOf(element) === value);
    if (scroller === null || !(target instanceof HTMLElement)) return;
    const left = target.offsetLeft + target.offsetWidth / 2 - scroller.clientWidth / 2;
    const glides = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches && Math.abs(scroller.scrollLeft - left) > 1;
    steering.current = glides;
    scroller.scrollTo({ left, behavior: glides ? 'smooth' : 'instant' });
  };
  // A picture closed leaves a gap the others close. The one picked stays where it is on screen — when it is the one
  // closed, the one after it takes the middle, or the one before it at the end — and every other slides from where it
  // was on screen, growing or shrinking as it goes where the row sizes a picture by its place.
  const seen = useRef<{ places: Map<HTMLElement, { left: number; scale: number }>; scrolled: number; centre?: Element }>({ places: new Map(), scrolled: 0 });
  const remember = useRef<() => void>(() => undefined);
  remember.current = () => {
    const scroller = row.current;
    if (scroller === null) return;
    const all = pictures().filter((picture): picture is HTMLElement => picture instanceof HTMLElement);
    const centre = all.find((picture) => valueOf(picture) === picked.current);
    seen.current = {
      places: new Map(all.map((picture) => [picture, { left: picture.offsetLeft, scale: Number(getComputedStyle(picture).scale) || 1 }])),
      scrolled: scroller.scrollLeft,
      ...(centre === undefined ? {} : { centre }),
    };
  };
  useBeforePaint(() => {
    const scroller = row.current;
    if (scroller === null) return;
    const all = pictures().filter((picture): picture is HTMLElement => picture instanceof HTMLElement);
    const { places, scrolled, centre } = seen.current;
    const before = [...places.keys()];
    if (before.some((picture) => !all.includes(picture))) {
      const at = centre instanceof HTMLElement ? before.indexOf(centre) : -1;
      const stays = at < 0 ? undefined : [...before.slice(at), ...before.slice(0, at).reverse()].find((picture) => all.includes(picture));
      // Snapping is off while the row is set and the others slide: the browser would snap it again, to a place of its
      // own when the picture it was snapped to is the one closed.
      scroller.style.scrollSnapType = 'none';
      if (stays !== undefined) {
        scroller.scrollLeft = stays.offsetLeft + stays.offsetWidth / 2 - scroller.clientWidth / 2;
        picked.current = valueOf(stays);
      }
      const slides: Animation[] = [];
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const sized = CSS.supports('animation-timeline: view()');
        for (const picture of all) {
          const was = places.get(picture);
          if (was === undefined) continue;
          const dx = was.left - scrolled - (picture.offsetLeft - scroller.scrollLeft);
          if (Math.abs(dx) <= 1) continue;
          slides.push(picture.animate([{ translate: `${dx}px 0`, ...(sized ? { scale: String(was.scale) } : {}) }, { translate: '0 0' }], { duration: 380, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }));
        }
      }
      const snap = (): void => {
        scroller.style.removeProperty('scroll-snap-type');
      };
      if (slides.length === 0) requestAnimationFrame(snap);
      else void Promise.allSettled(slides.map((slide) => slide.finished)).then(snap);
    }
    remember.current();
  });
  // Placed at the picture picked as soon as there are pictures; after that, it scrolls only to a pick made elsewhere.
  const placed = useRef(false);
  useEffect(() => {
    if (selected === undefined || pictures().length === 0) return;
    if (!placed.current) {
      placed.current = true;
      picked.current = selected;
      scrollTo(selected, false);
      return;
    }
    if (selected === picked.current) return;
    picked.current = selected;
    scrollTo(selected, true);
  });
  useEffect(() => {
    const scroller = row.current;
    if (scroller === null) return undefined;
    const settle = (): void => {
      if (steering.current) {
        steering.current = false;
        scroller.removeAttribute('data-dragging');
      }
      const value = valueOf(centred());
      if (value !== undefined) pick.current(value);
    };
    let looking = false;
    const onScroll = (): void => {
      remember.current();
      if (looking || steering.current || drag !== undefined) return;
      looking = true;
      requestAnimationFrame(() => {
        looking = false;
        const value = valueOf(centred());
        if (value !== undefined && !steering.current) pick.current(value);
      });
    };
    let drag: { id: number; x: number; left: number; lastX: number; lastAt: number; speed: number; moved: boolean } | undefined;
    const onDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, left: scroller.scrollLeft, lastX: event.clientX, lastAt: performance.now(), speed: 0, moved: false };
    };
    const onMove = (event: PointerEvent): void => {
      if (drag === undefined || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        scroller.setAttribute('data-dragging', '');
        scroller.setPointerCapture(event.pointerId);
      }
      const now = performance.now();
      drag.speed = (event.clientX - drag.lastX) / Math.max(1, now - drag.lastAt);
      drag.lastX = event.clientX;
      drag.lastAt = now;
      scroller.scrollLeft = drag.left - dx;
    };
    const onUp = (event: PointerEvent): void => {
      if (drag === undefined || event.pointerId !== drag.id) return;
      const { moved, speed } = drag;
      drag = undefined;
      if (!moved) return;
      const swallow = (click: MouseEvent): void => click.stopPropagation();
      scroller.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => scroller.removeEventListener('click', swallow, { capture: true }), 0);
      const projected = scroller.scrollLeft - speed * 260 + scroller.clientWidth / 2;
      const nearest = pictures().reduce<{ value?: number; off: number }>(
        (best, element) => {
          const off = element instanceof HTMLElement ? Math.abs(element.offsetLeft + element.offsetWidth / 2 - projected) : Infinity;
          return off < best.off ? { value: valueOf(element), off } : best;
        },
        { off: Infinity },
      ).value;
      scrollTo(nearest, true);
      if (!steering.current) scroller.removeAttribute('data-dragging');
      if (nearest !== undefined) pick.current(nearest);
    };
    let turning = false;
    const onWheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (turning || Math.abs(event.deltaY) < 4) return;
      turning = true;
      setTimeout(() => {
        turning = false;
      }, 260);
      const all = pictures();
      const at = all.findIndex((element) => valueOf(element) === picked.current);
      const next = valueOf(all[Math.max(0, Math.min(all.length - 1, at + Math.sign(event.deltaY)))]);
      scrollTo(next, true);
      if (next !== undefined) pick.current(next);
    };
    scroller.addEventListener('scrollend', settle);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('pointerdown', onDown);
    scroller.addEventListener('pointermove', onMove);
    scroller.addEventListener('pointerup', onUp);
    scroller.addEventListener('pointercancel', onUp);
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('scrollend', settle);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('pointerdown', onDown);
      scroller.removeEventListener('pointermove', onMove);
      scroller.removeEventListener('pointerup', onUp);
      scroller.removeEventListener('pointercancel', onUp);
      scroller.removeEventListener('wheel', onWheel);
    };
  }, []);
  return (
    <div className="k-deck">
      <div ref={row} className="k-deck-row">
        {children}
      </div>
    </div>
  );
};
Deck.meta = { description: 'Pictures side by side, the one in the middle picked; writes its value to the node’s `model`.', propsSchema: DeckProps };

// A picture swiped up is closed: it flies off, and is sent as Delete on it, with its value.
const MiniProps = z.object({
  value: z.number().describe('Which picture it is; sent with the click as its payload.'),
  selected: z.boolean().optional().describe('Whether it is the one picked.'),
  closable: z.boolean().optional().describe('Whether it can be swiped up and away, closing it.'),
});
export const Mini: NovaComponent = ({ children, novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { value, selected, closable } = parsed(MiniProps, props, { value: 0 });
  const own = useRef<HTMLElement>(null);
  const close = useRef<() => void>(() => undefined);
  close.current = () => {
    if (novaRef !== undefined) dispatch({ type: 'ui:key', ref: novaRef, key: 'Delete', payload: value });
  };
  useEffect(() => {
    const mini = own.current;
    if (mini === null || closable !== true) return undefined;
    let lift: { id: number; x: number; y: number; at: number; on: boolean } | undefined;
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button') !== null)) return;
      lift = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), on: false };
    };
    const onMove = (event: PointerEvent): void => {
      if (lift === undefined || event.pointerId !== lift.id) return;
      const dx = event.clientX - lift.x;
      const dy = event.clientY - lift.y;
      if (!lift.on) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          lift = undefined;
          return;
        }
        if (dy > -12) return;
        lift.on = true;
        mini.setPointerCapture(event.pointerId);
      }
      mini.style.translate = `0 ${Math.min(0, dy)}px`;
      mini.style.opacity = String(Math.max(0.2, 1 + Math.min(0, dy) / 500));
    };
    const onUp = (event: PointerEvent): void => {
      if (lift === undefined || event.pointerId !== lift.id) return;
      const { y, at, on } = lift;
      lift = undefined;
      if (!on) return;
      const swallow = (click: MouseEvent): void => click.stopPropagation();
      mini.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => mini.removeEventListener('click', swallow, { capture: true }), 0);
      const dy = event.clientY - y;
      const from = { translate: mini.style.translate, opacity: mini.style.opacity || '1' };
      const away = event.type !== 'pointercancel' && (dy < -mini.offsetHeight * 0.25 || -dy / Math.max(1, performance.now() - at) > 0.6);
      const deck = mini.closest('.k-deck');
      const copy = mini.cloneNode(true);
      if (!away || deck === null || !(copy instanceof HTMLElement)) {
        mini.style.translate = '';
        mini.style.opacity = '';
        mini.animate([from, { translate: '0 0', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
        return;
      }
      // The close is sent at once and a copy flies off in its place, so the others close the gap as soon as it is done.
      const box = mini.getBoundingClientRect();
      Object.assign(copy.style, {
        position: 'fixed',
        left: `${String(box.left + (box.width - mini.offsetWidth) / 2)}px`,
        top: `${String(box.top)}px`,
        width: `${String(mini.offsetWidth)}px`,
        margin: '0',
        translate: '0 0',
        scale: getComputedStyle(mini).scale,
        animation: 'none',
        transition: 'none',
        pointerEvents: 'none',
      });
      deck.append(copy);
      mini.style.visibility = 'hidden';
      mini.style.translate = '';
      mini.style.opacity = '';
      close.current();
      void copy
        .animate([{ opacity: from.opacity }, { translate: `0 ${-window.innerHeight}px`, opacity: 0 }], { duration: 260, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'forwards' })
        .finished.then(
          () => copy.remove(),
          () => copy.remove(),
        );
      // A close that did not happen gives the picture back.
      setTimeout(() => {
        if (mini.isConnected) mini.style.visibility = '';
      }, 4000);
    };
    mini.addEventListener('pointerdown', onDown);
    mini.addEventListener('pointermove', onMove);
    mini.addEventListener('pointerup', onUp);
    mini.addEventListener('pointercancel', onUp);
    return () => {
      mini.removeEventListener('pointerdown', onDown);
      mini.removeEventListener('pointermove', onMove);
      mini.removeEventListener('pointerup', onUp);
      mini.removeEventListener('pointercancel', onUp);
    };
  }, [closable]);
  return (
    <figure ref={own} className="k-mini" data-value={value} data-selected={selected === true ? '' : undefined} onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), payload: value })}>
      {children}
    </figure>
  );
};
Mini.meta = { description: 'One picture in a deck, with its caption under it; dispatches ui:click with its ref and its value, and, swiped up when closable, ui:key Delete with its value.', propsSchema: MiniProps };

// A screen drawn small: laid out as the full-size grid lays it, its cards folded as the grid folds them.
const MiniatureProps = z.object({ columns: z.number().int().min(1).max(3).optional().describe('How many columns its areas are laid out in on a wide screen.') });
export const Miniature: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { columns } = parsed(MiniatureProps, props, {});
  const sheet = useRef<HTMLDivElement>(null);
  useBeforePaint(() => {
    const own = sheet.current;
    if (own === null) return;
    const folded = foldOf(own, undefined);
    own.style.setProperty('--rows', folded?.rows ?? 'none');
    own.toggleAttribute('data-folded', folded !== undefined);
    for (const area of own.querySelectorAll<HTMLElement>(':scope > .k-area')) area.toggleAttribute('data-open', folded !== undefined && area.dataset['name'] === folded.open);
  });
  return (
    <div className="k-miniature" aria-hidden="true" inert>
      <div ref={sheet} className="k-miniature-sheet" data-columns={columns ?? 2}>
        {children}
      </div>
    </div>
  );
};
Miniature.meta = { description: 'Areas drawn small, laid out and folded as the full-size grid lays them out.', propsSchema: MiniatureProps };

// Cards as nova drew them, drawn again: what a screen looked like.
const PictureProps = z.object({ tree: z.array(z.unknown()).describe('The cards as nova drew them: their render tree.') });
export const Picture: NovaComponent = ({ novaRef: _ref, novaModel: _model, ...props }) => {
  const { tree } = parsed(PictureProps, props, { tree: [] });
  return <RenderTree nodes={tree as RenderNode[]} />;
};
Picture.meta = { description: 'Cards drawn from a render tree nova made: a screen as it was drawn.', propsSchema: PictureProps };
