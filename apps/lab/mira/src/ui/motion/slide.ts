import { EASE } from './layers';
import type { Pace } from './layers';
import { copyOf, place, stageOver } from './stage';
import type { Card } from './stage';

// Back and forward move along the stack, which the overview lays out oldest at the left: going forward, the answer
// shown leaves to the left and the next comes in from the right; going back, the other way round.
export type Slide = { grid: HTMLElement; direction: 1 | -1; width: number; shown: HTMLElement; next?: HTMLElement; offset: number; running: Animation[] };

const sheetOf = (grid: HTMLElement, cards: readonly Card[], fixed: boolean): HTMLElement => {
  const sheet = stageOver(grid, fixed);
  sheet.style.height = `${grid.offsetHeight}px`;
  cards.forEach((card, at) => {
    const element = copyOf(card.element);
    element.style.zIndex = String(100 - (at + 1) * 10);
    place(element, card.box);
    sheet.append(element);
  });
  return sheet;
};

// The answer shown, held where it is on the screen whatever the page does under it.
export const holdSlide = (grid: HTMLElement, cards: readonly Card[], direction: 1 | -1): Slide => {
  const shown = sheetOf(grid, cards, true);
  const height = grid.offsetHeight;
  grid.style.flex = 'none';
  grid.style.height = `${height}px`;
  return { grid, direction, width: grid.offsetWidth, shown, offset: 0, running: [] };
};

const stop = (slide: Slide): void => {
  for (const animation of slide.running) {
    try {
      animation.commitStyles();
    } catch {
      // An element no longer drawn has nothing to commit.
    }
    animation.cancel();
  }
  slide.running = [];
};

export const follow = (slide: Slide, offset: number): void => {
  stop(slide);
  slide.offset = offset;
  slide.shown.style.translate = `${offset}px 0`;
  if (slide.next !== undefined) slide.next.style.translate = `${offset + slide.direction * slide.width}px 0`;
};

// The answer it goes to, beside the one shown, at the scroll it was left at.
export const showNext = (slide: Slide, cards: readonly Card[], height: number): void => {
  slide.next?.remove();
  slide.grid.style.height = `${height}px`;
  slide.next = sheetOf(slide.grid, cards, false);
  slide.next.style.height = `${height}px`;
  follow(slide, slide.offset);
};

export const playSlide = (slide: Slide, to: 'end' | 'start', pace: Pace): Promise<void> => {
  stop(slide);
  const from = slide.offset;
  const target = to === 'end' ? -slide.direction * slide.width : 0;
  const share = Math.min(1, Math.abs(target - from) / slide.width);
  const duration = Math.max(180, pace.duration * Math.sqrt(share));
  const sheets: [HTMLElement, number][] = [[slide.shown, 0], ...(slide.next === undefined ? [] : [[slide.next, slide.direction * slide.width] as [HTMLElement, number]])];
  slide.offset = target;
  for (const [sheet, beside] of sheets) {
    sheet.style.translate = `${target + beside}px 0`;
    const frames = pace.reduced ? [{ translate: `${target + beside}px 0` }, { translate: `${target + beside}px 0` }] : [{ translate: `${from + beside}px 0` }, { translate: `${target + beside}px 0` }];
    slide.running.push(sheet.animate(frames, { duration: pace.reduced ? 200 : duration, easing: EASE, fill: 'both' }));
  }
  if (pace.reduced) slide.running.push(slide.shown.animate([{ opacity: 1 }, { opacity: to === 'end' ? 0 : 1 }], { duration: 200, easing: 'linear', fill: 'both' }));
  return Promise.all(slide.running.map((animation) => animation.finished.then(
    () => undefined,
    () => undefined,
  ))).then(() => undefined);
};

export const dropSlide = (slide: Slide): void => {
  for (const animation of slide.running) animation.cancel();
  slide.shown.remove();
  slide.next?.remove();
  slide.grid.style.flex = '';
  slide.grid.style.height = '';
};
