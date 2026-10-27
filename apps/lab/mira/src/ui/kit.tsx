import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
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

export const INKS = ['turn-1', 'turn-2', 'turn-3', 'turn-4', 'turn-5', 'screen-1', 'screen-2'] as const;
const Ink = z.enum(INKS).describe('The ink: the turn of the answer that put it there, or the screen it is on.');
const Place = z.number().int().min(1).max(6);

const PageProps = z.object({}).describe('The page: a centred column with the app’s background.');
export const Page: NovaComponent = ({ children }) => <main className="k-page">{children}</main>;
Page.meta = { description: 'The page: a centred column.', propsSchema: PageProps };

const RowProps = z.object({
  tone: z.enum(['default', 'entry', 'controls', 'links']).optional().describe('default | entry: one entry of a list | controls: back, what is shown, forward | links: links to other screens'),
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
    .enum(['default', 'lead', 'muted', 'strong', 'display', 'right', 'wrong', 'error', 'title', 'meta', 'quote', 'mark', 'tag'])
    .optional()
    .describe(
      'default | lead: the sentence a card opens with | muted | strong | display: one big figure | right: a right answer, said | wrong: a wrong answer, said | error | title: what a picture shows | meta: where a thing stands, small | quote: words a person wrote | mark: what the last answer did to an area, one word | tag: what a thing in a list is, one word',
    ),
});
export const Text: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { tone } = parsed(TextProps, props, {});
  return <p className={tone === undefined || tone === 'default' ? 'k-text' : `k-text k-${tone}`}>{children}</p>;
};
Text.meta = { description: 'A paragraph.', propsSchema: TextProps };

const ARROWS = { back: 'M15 4.5 7.5 12l7.5 7.5', forward: 'M9 4.5 16.5 12 9 19.5' } as const;

const ButtonProps = z.object({
  label: z.string().optional().describe('What the button says; falls back to its children. With an icon, what it is called.'),
  tone: z
    .enum(['primary', 'suggestion', 'link', 'choice', 'chosen', 'right', 'wrong'])
    .optional()
    .describe(
      'primary: what the action does | suggestion: a thing to ask | link: opens another screen | choice: one of a set to choose from | chosen: the one of the set that is chosen | right: the right one of a set, once picked | wrong: a wrong one, picked',
    ),
  icon: z.enum(['back', 'forward']).optional().describe('Drawn instead of the label: back | forward.'),
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
      onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), ...(value !== undefined ? { payload: value } : {}) })}
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

// Lifted while the answer runs on under it. Its height is the page's to know, as `--dock-h`, so what opens above it
// stops at its top.
const DockProps = z.object({
  ink: Ink.optional().describe('The ink of the answer it would ask for next.'),
  asking: z.boolean().optional().describe('Whether a question is being answered.'),
  error: z.boolean().optional().describe('Whether the last question got no screen.'),
});
export const Dock: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { ink, asking, error } = parsed(DockProps, props, {});
  const own = useRef<HTMLElement>(null);
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    const element = own.current;
    if (element === null) return undefined;
    const root = document.documentElement;
    const measure = (): void => {
      root.style.setProperty('--dock-h', `${element.offsetHeight}px`);
      setLifted(root.scrollHeight - window.scrollY - window.innerHeight > 2);
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(element);
    sizes.observe(document.body);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      sizes.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--dock-h');
    };
  }, []);
  return (
    <footer ref={own} className="k-dock" data-ink={ink} data-asking={asking === true ? '' : undefined} data-error={error === true ? '' : undefined} data-lifted={lifted ? '' : undefined}>
      {children}
    </footer>
  );
};
Dock.meta = { description: 'What stays at the bottom while the answer scrolls above it: the last layer, in the ink of the next answer.', propsSchema: DockProps };

const GridProps = z.object({
  columns: z.number().int().min(1).max(3).optional().describe('How many columns its areas are laid out in on a wide screen: 1 to 3.'),
  at: z.number().int().min(0).optional().describe('Where the answer it shows stands among the answers.'),
});
export const Grid: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { columns } = parsed(GridProps, props, {});
  return (
    <main className="k-grid" data-columns={columns ?? 2}>
      {children}
    </main>
  );
};
Grid.meta = { description: 'Areas laid over each other, one under the next; in columns on a wide screen.', propsSchema: GridProps };

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
  tone: z.enum(['default', 'hero']).optional().describe('default | hero: the card a screen opens with'),
});
export const Card: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { title, tone } = parsed(CardProps, props, {});
  return (
    <article className={tone === 'hero' ? 'k-card k-hero' : 'k-card'}>
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
export const Input: NovaComponent = ({ novaRef, novaModel, ...props }) => {
  const dispatch = useNovaDispatch();
  const { placeholder, value, clearOnEnter, tone } = parsed(InputProps, props, {});
  const [draft, setDraft] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ref = novaModel?.ref ?? novaRef;
  const echoed = cell(value);
  const emptied = sent && echoed === '';
  useEffect(() => {
    if (!emptied) return;
    setSent(false);
    setDraft(null);
  }, [emptied]);
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSent(false);
    setDraft(event.target.value);
    if (novaModel !== undefined) dispatch({ type: 'ui:model', ref: novaModel.ref, payload: event.target.value });
  };
  // A line with nothing in it has nothing to send.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const sends = event.key === 'Enter' && clearOnEnter === true;
    if (sends && event.currentTarget.value.trim() === '') return;
    if (ref !== undefined) dispatch({ type: 'ui:key', ref, key: event.key });
    if (sends) setSent(true);
  };
  return (
    <input
      className={tone === 'line' ? 'k-input k-line' : 'k-input'}
      placeholder={placeholder}
      value={emptied ? '' : (draft ?? echoed)}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={() => setDraft(echoed)}
      onBlur={() => setDraft(null)}
    />
  );
};
Input.meta = { description: 'A line of text, bound to data with the node’s `model`; Enter is a ui:key.', propsSchema: InputProps };

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
      if (!['ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key)) return;
      if (capture !== true && typedInto(event.target) && !(event.key.startsWith('Arrow') && emptyField(event.target))) return;
      if (event.key === 'Enter' && ((typedInto(event.target) && !emptyField(event.target)) || (event.target instanceof Element && event.target.closest('button, a') !== null))) return;
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
Keys.meta = { description: 'Draws nothing: the arrow keys, Enter and Escape pressed on the page, and a sideways swipe, each sent as a ui:key with its ref.', propsSchema: KeysProps };

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

const MiniProps = z.object({
  value: z.number().describe('Which picture it is; sent with the click as its payload.'),
  selected: z.boolean().optional().describe('Whether it is the one picked.'),
});
export const Mini: NovaComponent = ({ children, novaRef, novaModel: _model, ...props }) => {
  const dispatch = useNovaDispatch();
  const { value, selected } = parsed(MiniProps, props, { value: 0 });
  return (
    <figure className="k-mini" data-value={value} data-selected={selected === true ? '' : undefined} onClick={() => dispatch({ type: 'ui:click', ...(novaRef !== undefined ? { ref: novaRef } : {}), payload: value })}>
      {children}
    </figure>
  );
};
Mini.meta = { description: 'One picture in a deck, with its caption under it; dispatches ui:click with its ref and its value.', propsSchema: MiniProps };

const MiniatureProps = z.object({ columns: z.number().int().min(1).max(3).optional().describe('How many columns its areas are laid out in on a wide screen.') });
export const Miniature: NovaComponent = ({ children, novaRef: _ref, novaModel: _model, ...props }) => {
  const { columns } = parsed(MiniatureProps, props, {});
  return (
    <div className="k-miniature" aria-hidden="true">
      <div className="k-miniature-sheet" data-columns={columns ?? 2}>
        {children}
      </div>
    </div>
  );
};
Miniature.meta = { description: 'Areas drawn small, laid out as the full-size grid lays them.', propsSchema: MiniatureProps };
