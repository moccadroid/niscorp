import { copyOf, place, stageOver } from './stage';
import type { Card } from './stage';

export const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';

type Span = { top: number; height: number };
type Geo = { left: number; width: number; from: Span; to: Span };
type Piece = { element: HTMLElement; id: string; says: string; under?: HTMLElement };

// An answer's cards moving on the stage: the copies it shows, the ones folding away, and what is running.
export type Layers = { stage: HTMLElement; grid: HTMLElement; pieces: Piece[]; leaving: HTMLElement[]; running: Animation[] };

export type Pace = { duration: number; fold: number; reduced: boolean };

const zOf = (at: number): number => 100 - (at + 1) * 10;
const px = (value: string): number => Number.parseFloat(value) || 0;
const spanOf = (element: HTMLElement): Span => ({ top: px(element.style.top), height: px(element.style.height) });
const leftOf = (element: HTMLElement): number => px(element.style.left);
const sameColumn = (a: number, b: number): boolean => Math.abs(a - b) < 2;
// A new skin's edge runs down past its own foot; the old skin under it is cut away just above that edge, so it shows only
// where the edge's rounded corners and what is below it leave room, and nothing of it is left at the end.
const skinFrom = (fold: number): string => `inset(0px 0px 100% 0px round 0px 0px ${fold}px ${fold}px)`;
const skinTo = (fold: number): string => `inset(0px 0px ${-fold}px 0px round 0px 0px ${fold}px ${fold}px)`;
const underFrom = (fold: number): string => `inset(${-fold}px 0px 0px 0px)`;
const underTo = 'inset(100% 0px 0px 0px)';

const holdHeight = (element: HTMLElement, height: number): void => {
  element.style.flex = 'none';
  element.style.height = `${height}px`;
};

// The cards as they stand, copied onto a stage over the grid, so the page's own can change unseen under it.
export const holdLayers = (grid: HTMLElement, cards: readonly Card[]): Layers => {
  const stage = stageOver(grid, false);
  const height = grid.offsetHeight;
  holdHeight(stage, height);
  holdHeight(grid, height);
  const pieces = cards.map((card, at) => {
    const element = copyOf(card.element);
    element.style.zIndex = String(zOf(at));
    place(element, card.box);
    stage.append(element);
    return { element, id: card.id, says: card.says };
  });
  return { stage, grid, pieces, leaving: [], running: [] };
};

// Everything running stops where it has got to, so the page under it can be measured as it rests.
export const settle = (layers: Layers): void => {
  for (const animation of layers.running) {
    try {
      animation.commitStyles();
    } catch {
      // An element no longer drawn has nothing to commit.
    }
    animation.cancel();
  }
  layers.running = [];
};

// What the page works out from a card's place among the others, taken from the card it now is.
const refresh = (piece: HTMLElement, card: HTMLElement): void => {
  const style = getComputedStyle(card);
  for (const name of ['--c', '--ink']) piece.style.setProperty(name, style.getPropertyValue(name));
  const skin = piece.querySelector<HTMLElement>(':scope > .k-skin');
  if (skin !== null) skin.style.padding = style.padding;
  const was = piece.querySelector<HTMLElement>(':scope > .k-mark');
  const mark = card.querySelector<HTMLElement>(':scope > .k-mark');
  if (was?.textContent === (mark?.textContent ?? undefined)) return;
  if (was !== null) void was.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'both' }).finished.then(() => was.remove(), () => was.remove());
  if (mark === null) return;
  const copy = mark.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return;
  copy.style.top = getComputedStyle(mark).top;
  piece.prepend(copy);
  copy.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120, fill: 'backwards' });
};

// One move from what the stage shows to `cards`, the page's cards at rest. A card both hold slides to its new place; a
// card written where another was re-inks in place, its new skin wiping down over the old; a new card grows from under
// the foot of the card above it while the cards below make room; a card no longer there folds up under its neighbour.
// Every top and height shares one easing and one length, so each foot stays laid over the next at every frame. A move
// already running is taken from wherever it has got to.
export const moveLayers = (layers: Layers, cards: readonly Card[], height: number, pace: Pace): Promise<void> => {
  settle(layers);
  const { stage, grid } = layers;
  const { duration, fold, reduced } = pace;
  const columnsOf = (lefts: readonly number[]): number[] => [...new Set(lefts.map((left) => Math.round(left)))].sort((a, b) => a - b);
  const was = columnsOf(layers.pieces.map((piece) => leftOf(piece.element)));
  const will = columnsOf(cards.map((card) => card.box.left));
  if (!reduced && was.length > 0 && (was.length !== will.length || was.some((left, at) => !sameColumn(left, will[at] ?? -1)))) return relay(layers, cards, height, pace);
  const before = layers.pieces.map((piece) => ({ ...piece, span: spanOf(piece.element), left: leftOf(piece.element) }));
  const beforeLeaving = layers.leaving.map((element) => ({ element, span: spanOf(element), left: leftOf(element), width: px(element.style.width) }));
  const ids = new Set(cards.map((card) => card.id));

  const pieces: Piece[] = [];
  const geo = new Map<HTMLElement, Geo>();
  const growing = new Set<HTMLElement>();
  const wiping: HTMLElement[] = [];
  const unfinished: HTMLElement[] = [];
  const became = new Map<HTMLElement, HTMLElement>();
  const used = new Set<HTMLElement>();
  const leaving: HTMLElement[] = [];

  cards.forEach((card, at) => {
    const { left, width } = card.box;
    const to = { top: card.box.top, height: card.box.height };
    const kept = before.find((old) => old.id === card.id && sameColumn(old.left, left));
    const paired = kept ?? (before[at] !== undefined && !ids.has(before[at].id) && !used.has(before[at].element) && sameColumn(before[at].left, left) ? before[at] : undefined);
    if (kept !== undefined && kept.says === card.says) {
      used.add(kept.element);
      refresh(kept.element, card.element);
      pieces.push({ element: kept.element, id: card.id, says: card.says, under: kept.under });
      geo.set(kept.element, { left, width, from: kept.span, to });
      if (kept.under !== undefined) geo.set(kept.under, { left, width, from: kept.span, to });
      if (kept.element.style.clipPath !== '') unfinished.push(kept.element);
      became.set(kept.element, kept.element);
      return;
    }
    const element = copyOf(card.element);
    stage.append(element);
    if (paired !== undefined) {
      used.add(paired.element);
      paired.under?.remove();
      paired.element.style.clipPath = '';
      pieces.push({ element, id: card.id, says: card.says, under: paired.element });
      geo.set(element, { left, width, from: paired.span, to });
      geo.set(paired.element, { left, width, from: paired.span, to });
      became.set(paired.element, element);
      wiping.push(element);
      return;
    }
    pieces.push({ element, id: card.id, says: card.says });
    growing.add(element);
    geo.set(element, { left, width, from: { top: to.top, height: 0 }, to });
  });
  for (const old of before) {
    if (used.has(old.element)) continue;
    old.under?.remove();
    leaving.push(old.element);
  }
  leaving.push(...beforeLeaving.map((old) => old.element));

  pieces.forEach((piece, at) => {
    piece.element.style.zIndex = String(zOf(at));
    if (piece.under !== undefined) piece.under.style.zIndex = String(zOf(at) - 1);
  });

  // Column by column, the layers in the order they lie: what stays, what grows in after the layer above it, what folds
  // away after the layer above it. A growing layer starts under the foot of the one before it and a folding layer ends
  // under it, so the stack stays closed from the first frame to the last.
  const oldSpans = new Map<HTMLElement, { span: Span; left: number; width: number }>([
    ...before.map((old) => [old.element, { span: old.span, left: old.left, width: px(old.element.style.width) }] as const),
    ...beforeLeaving.map((old) => [old.element, { span: old.span, left: old.left, width: old.width }] as const),
  ]);
  const oldOrder = [...oldSpans.keys()].sort((a, b) => (oldSpans.get(a)?.span.top ?? 0) - (oldSpans.get(b)?.span.top ?? 0));
  const columns = [...new Set([...cards.map((card) => Math.round(card.box.left)), ...oldOrder.map((element) => Math.round(oldSpans.get(element)?.left ?? 0))])];
  for (const x of columns) {
    const olds = oldOrder.filter((element) => sameColumn(oldSpans.get(element)?.left ?? 0, x));
    const news = pieces.map((piece) => piece.element).filter((element) => sameColumn(geo.get(element)?.left ?? 0, x));
    const sequence: HTMLElement[] = [];
    let i = 0;
    let j = 0;
    while (i < olds.length || j < news.length) {
      const next = news[j];
      const old = olds[i];
      if (next !== undefined && growing.has(next)) {
        sequence.push(next);
        j++;
      } else if (old !== undefined && leaving.includes(old)) {
        sequence.push(old);
        i++;
      } else if (next !== undefined) {
        sequence.push(next);
        if (old !== undefined && became.get(old) === next) i++;
        j++;
      } else i++;
    }
    let above: HTMLElement | undefined;
    for (const element of sequence) {
      const prior = above === undefined ? undefined : geo.get(above);
      if (growing.has(element)) {
        const own = geo.get(element);
        if (own !== undefined && prior !== undefined) own.from = { top: prior.from.top + prior.from.height - fold, height: fold };
      } else if (leaving.includes(element)) {
        const old = oldSpans.get(element);
        if (old !== undefined) {
          geo.set(element, { left: old.left, width: old.width, from: old.span, to: prior !== undefined ? { top: prior.to.top + prior.to.height - fold, height: fold } : { top: old.span.top, height: 0 } });
          element.style.zIndex = String(above !== undefined ? Number(above.style.zIndex) - (leaving.includes(above) ? 1 : 5) : 95);
        }
      }
      above = element;
    }
  }

  const running: Animation[] = [];
  const animate = (element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions = {}): void => {
    running.push(element.animate(frames, { duration, easing: EASE, fill: 'both', ...options }));
  };
  for (const [element, { left, width, from, to }] of geo) {
    const at = reduced && leaving.includes(element) ? from : to;
    place(element, { left, width, top: at.top, height: at.height });
    if (reduced || (Math.abs(from.top - to.top) < 0.5 && Math.abs(from.height - to.height) < 0.5)) continue;
    animate(element, [
      { top: `${from.top}px`, height: `${from.height}px` },
      { top: `${to.top}px`, height: `${to.height}px` },
    ]);
  }
  const fromHeight = stage.offsetHeight;
  holdHeight(stage, height);
  holdHeight(grid, height);
  if (!reduced && Math.abs(fromHeight - height) > 0.5) {
    for (const element of [stage, grid]) animate(element, [{ height: `${fromHeight}px` }, { height: `${height}px` }]);
  }
  if (reduced) {
    for (const element of unfinished) element.style.clipPath = '';
    for (const element of [...wiping, ...growing]) animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
    for (const element of leaving) animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'linear' });
  } else {
    const underOf = new Map(pieces.map((piece) => [piece.element, piece.under]));
    const lead = wiping.length > 1 ? Math.min(90, (duration * 0.3) / (wiping.length - 1)) : 0;
    wiping.forEach((element, k) => {
      const timing = { duration: duration - lead * (wiping.length - 1), delay: lead * k };
      animate(element, [{ clipPath: skinFrom(fold) }, { clipPath: skinTo(fold) }], timing);
      const under = underOf.get(element);
      if (under !== undefined) animate(under, [{ clipPath: underFrom(fold) }, { clipPath: underTo }], timing);
    });
    for (const element of unfinished) {
      animate(element, [{ clipPath: element.style.clipPath }, { clipPath: skinTo(fold) }]);
      const under = underOf.get(element);
      if (under !== undefined) animate(under, [{ clipPath: under.style.clipPath || underFrom(fold) }, { clipPath: underTo }]);
    }
  }

  layers.pieces = pieces;
  layers.leaving = leaving;
  layers.running = running;
  return done(running);
};

const done = (running: readonly Animation[]): Promise<void> =>
  Promise.all(running.map((animation) => animation.finished.then(
    () => undefined,
    () => undefined,
  ))).then(() => undefined);

// When the answer is laid out in other columns, no card has a place to slide to: the new layout comes down over the old
// as one sheet, a single edge running down the screen. Each new card shows above the edge, with a rounded foot at it;
// each old card is cut away just above it, so the screen stays covered from the first frame to the last.
const relay = (layers: Layers, cards: readonly Card[], height: number, pace: Pace): Promise<void> => {
  const { stage, grid } = layers;
  const { duration, fold } = pace;
  for (const piece of layers.pieces) {
    piece.under?.remove();
    piece.element.style.clipPath = '';
  }
  const olds = [...layers.pieces.map((piece) => piece.element), ...layers.leaving];
  const fromHeight = stage.offsetHeight;
  const reach = Math.max(fromHeight, height) + fold;
  const at = (y: number): number => Math.min(1, Math.max(0, y / reach));
  const running: Animation[] = [];
  const animate = (element: HTMLElement, frames: Keyframe[]): void => {
    running.push(element.animate(frames, { duration, easing: EASE, fill: 'both' }));
  };
  for (const element of olds) {
    const { top, height: tall } = spanOf(element);
    element.style.zIndex = String(Math.max(1, Math.round(Number(element.style.zIndex) / 10)));
    const shown = 'inset(0px 0px 0px 0px)';
    const gone = `inset(${tall}px 0px 0px 0px)`;
    animate(element, [
      { offset: 0, clipPath: shown },
      { offset: at(top + fold), clipPath: shown },
      { offset: at(top + tall + fold), clipPath: gone },
      { offset: 1, clipPath: gone },
    ]);
  }
  layers.pieces = cards.map((card, index) => {
    const element = copyOf(card.element);
    element.style.zIndex = String(zOf(index));
    place(element, card.box);
    stage.append(element);
    const { top, height: tall } = card.box;
    const hidden = `inset(0px 0px ${tall}px 0px round 0px 0px ${fold}px ${fold}px)`;
    animate(element, [
      { offset: 0, clipPath: hidden },
      { offset: at(top), clipPath: hidden },
      { offset: at(top + tall + fold), clipPath: skinTo(fold) },
      { offset: 1, clipPath: skinTo(fold) },
    ]);
    return { element, id: card.id, says: card.says };
  });
  layers.leaving = olds;
  holdHeight(stage, height);
  holdHeight(grid, height);
  if (Math.abs(fromHeight - height) > 0.5) for (const element of [stage, grid]) animate(element, [{ height: `${fromHeight}px` }, { height: `${height}px` }]);
  layers.running = running;
  return done(running);
};

// Once a move has run its length, what folded away and the skins wiped over are gone from under it.
export const tidy = (layers: Layers): void => {
  settle(layers);
  for (const element of layers.leaving) element.remove();
  layers.leaving = [];
  for (const piece of layers.pieces) {
    piece.under?.remove();
    piece.under = undefined;
    piece.element.style.clipPath = '';
    piece.element.style.opacity = '';
  }
};

// The stage at rest matches the page when every card it shows is the page's card, where the page has it.
export const matches = (layers: Layers, cards: readonly Card[]): boolean =>
  layers.pieces.length === cards.length &&
  layers.pieces.every((piece, at) => {
    const card = cards[at];
    if (card === undefined || piece.id !== card.id || piece.says !== card.says) return false;
    const span = spanOf(piece.element);
    return Math.abs(span.top - card.box.top) < 1 && Math.abs(span.height - card.box.height) < 1 && Math.abs(leftOf(piece.element) - card.box.left) < 1;
  });

export const dropLayers = (layers: Layers): void => {
  for (const animation of layers.running) animation.cancel();
  layers.stage.remove();
  layers.grid.style.flex = '';
  layers.grid.style.height = '';
};
