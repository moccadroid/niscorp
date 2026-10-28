import { EASE } from './layers';
import type { Pace } from './layers';
import { copyOf, place, scrollLike, stageOver } from './stage';
import type { Card } from './stage';

// Back and forward move along the stack, which the overview lays out oldest at the left: going forward, the answer
// shown leaves to the left and the next comes in from the right; going back, the other way round. The two travel a gap
// apart, their corners rounded like the overview's pictures, and the one arriving squares them as it lands.
export type Slide = { grid: HTMLElement; direction: 1 | -1; step: number; corner: string; shown: HTMLElement; next?: HTMLElement; offset: number; running: Animation[] };

const lengthOf = (name: string): number => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

const sheetOf = (grid: HTMLElement, cards: readonly Card[], fixed: boolean): HTMLElement => {
  const sheet = stageOver(grid, fixed);
  sheet.style.height = `${grid.offsetHeight}px`;
  cards.forEach((card, at) => {
    const element = copyOf(card.element);
    element.style.zIndex = String(100 - (at + 1) * 10);
    place(element, card.box);
    sheet.append(element);
    scrollLike(element, card.element);
  });
  return sheet;
};

// The answer shown, held where it is on the screen whatever the page does under it.
export const holdSlide = (grid: HTMLElement, cards: readonly Card[], direction: 1 | -1): Slide => {
  const shown = sheetOf(grid, cards, true);
  const height = grid.offsetHeight;
  grid.style.flex = 'none';
  grid.style.height = `${height}px`;
  return { grid, direction, step: grid.offsetWidth + lengthOf('--slide-gap'), corner: `${lengthOf('--fold')}px`, shown, offset: 0, running: [] };
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

// Carried by a finger: both sheets rounded, where the finger has them.
export const follow = (slide: Slide, offset: number): void => {
  stop(slide);
  slide.offset = offset;
  slide.shown.style.translate = `${offset}px 0`;
  slide.shown.style.borderRadius = slide.corner;
  if (slide.next === undefined) return;
  slide.next.style.translate = `${offset + slide.direction * slide.step}px 0`;
  slide.next.style.borderRadius = slide.corner;
};

// The answer it goes to, beside the one shown.
export const showNext = (slide: Slide, cards: readonly Card[], height: number): void => {
  slide.next?.remove();
  slide.grid.style.height = `${height}px`;
  slide.next = sheetOf(slide.grid, cards, false);
  slide.next.style.height = `${height}px`;
  slide.next.style.translate = `${slide.offset + slide.direction * slide.step}px 0`;
  slide.next.style.borderRadius = slide.corner;
};

export const playSlide = (slide: Slide, to: 'end' | 'start', pace: Pace): Promise<void> => {
  stop(slide);
  const from = slide.offset;
  const target = to === 'end' ? -slide.direction * slide.step : 0;
  const share = Math.min(1, Math.abs(target - from) / slide.step);
  const duration = pace.reduced ? 200 : Math.max(180, pace.duration * Math.sqrt(share));
  const square = '0px';
  const arriving = to === 'end' ? slide.next : slide.shown;
  const sheets: [HTMLElement, number][] = [[slide.shown, 0], ...(slide.next === undefined ? [] : [[slide.next, slide.direction * slide.step] as [HTMLElement, number]])];
  slide.offset = target;
  for (const [sheet, beside] of sheets) {
    const end = `${target + beside}px 0`;
    const corners = sheet === arriving ? [slide.corner, slide.corner, square] : [sheet.style.borderRadius || square, slide.corner, slide.corner];
    sheet.style.translate = end;
    sheet.style.borderRadius = corners[2] ?? square;
    const frames: Keyframe[] = pace.reduced
      ? [{ translate: end }, { translate: end }]
      : [
          { offset: 0, translate: `${from + beside}px 0`, borderRadius: corners[0] },
          { offset: sheet === arriving ? 0.75 : 0.2, borderRadius: corners[1] },
          { offset: 1, translate: end, borderRadius: corners[2] },
        ];
    slide.running.push(sheet.animate(frames, { duration, easing: EASE, fill: 'both' }));
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
