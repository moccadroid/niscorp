import { EASE } from './layers';

// The dock's words as they stood before an update was drawn.
type Type = { paddingTop: string; lineHeight: string; fontSize: string; fontWeight: string; fontStretch: string };
export type Said = { title: string; count: string; chip?: DOMRect; line?: { text: string; box: DOMRect; type: Type } };

const typeOf = (element: Element): Type => {
  const { paddingTop, lineHeight, fontSize, fontWeight, fontStretch } = getComputedStyle(element);
  return { paddingTop, lineHeight, fontSize, fontWeight, fontStretch };
};

export const saidNow = (): Said => {
  const line = document.querySelector<HTMLInputElement>('.k-dock .k-line');
  return {
    title: document.querySelector('.k-chip-title')?.textContent ?? '',
    chip: document.querySelector('.k-chip-title')?.getBoundingClientRect(),
    count: document.querySelector('.k-chip-count')?.textContent ?? '',
    line: line === null ? undefined : { text: line.value, box: line.getBoundingClientRect(), type: typeOf(line) },
  };
};

const positionOf = (count: string): number => Number.parseInt(count, 10);

// Which way the chip's words go: with the stack, by where the answer named stands.
export const wayOf = (before: Said): 1 | -1 => {
  const now = positionOf(document.querySelector('.k-chip-count')?.textContent ?? '');
  const was = positionOf(before.count);
  return Number.isFinite(now) && Number.isFinite(was) && now < was ? -1 : 1;
};

// The old words leave sideways as the new ones come in after them; a question sent arrives in the chip by air, so its
// words only appear there as they land.
export const moveChip = (before: Said, how: 1 | -1 | 'landing', reduced: boolean): void => {
  const chip = document.querySelector<HTMLElement>('.k-chip');
  const title = chip?.querySelector<HTMLElement>('.k-chip-title');
  if (chip === null || chip === undefined || title === null || title === undefined || title.textContent === before.title) return;
  const leaving = document.createElement('span');
  leaving.className = 'k-chip-title k-chip-leaving';
  leaving.textContent = before.title;
  Object.assign(leaving.style, { left: `${title.offsetLeft}px`, top: `${title.offsetTop}px`, width: `${title.offsetWidth}px`, height: `${title.offsetHeight}px` });
  chip.append(leaving);
  const count = chip.querySelector<HTMLElement>('.k-chip-count');
  const counted = count !== null && count.textContent !== before.count;
  const running: Animation[] = [];
  if (reduced) {
    running.push(leaving.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'both' }));
    running.push(title.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'backwards' }));
  } else if (how === 'landing') {
    running.push(leaving.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'both' }));
    running.push(title.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 380, fill: 'backwards' }));
    if (counted) running.push(count.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 380, fill: 'backwards' }));
  } else {
    const away = `${-how * 28}px 0`;
    const from = `${how * 28}px 0`;
    running.push(leaving.animate([{ translate: '0 0', opacity: 1 }, { translate: away, opacity: 0 }], { duration: 220, easing: EASE, fill: 'both' }));
    running.push(title.animate([{ translate: from, opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 400, delay: 120, easing: EASE, fill: 'backwards' }));
    if (counted) running.push(count.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 120, easing: 'linear', fill: 'backwards' }));
  }
  void Promise.all(running.map((animation) => animation.finished.catch(() => undefined))).then(() => leaving.remove());
};

// The words leave the line upward into the chip as a question is sent, and come back down to it, from where the chip was,
// when it gets no screen. Words still in the air give way to the next.
let flying: Animation | undefined;
export const fly = (before: Said, up: boolean): void => {
  flying?.cancel();
  const line = document.querySelector<HTMLInputElement>('.k-dock .k-line');
  const title = document.querySelector<HTMLElement>('.k-chip-title');
  const from = before.line;
  if (line === null || title === null || from === undefined) return;
  const text = up ? from.text : line.value;
  if (text.trim() === '') return;
  const lineBox = up ? from.box : line.getBoundingClientRect();
  const style = up ? from.type : typeOf(line);
  const words = document.createElement('p');
  words.className = 'k-fly';
  words.textContent = text;
  Object.assign(words.style, {
    left: `${lineBox.left}px`,
    top: `${lineBox.top + Number.parseFloat(style.paddingTop)}px`,
    lineHeight: style.lineHeight,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStretch: style.fontStretch,
  });
  document.body.append(words);
  const chipBox = up || before.chip === undefined ? title.getBoundingClientRect() : before.chip;
  const height = words.offsetHeight;
  const rise = chipBox.top + chipBox.height / 2 - (lineBox.top + Number.parseFloat(style.paddingTop) + height / 2);
  const across = chipBox.left - lineBox.left;
  const small = Number.parseFloat(getComputedStyle(title).fontSize) / Number.parseFloat(style.fontSize);
  const frames: Keyframe[] = [
    { translate: '0 0', scale: '1', opacity: 1 },
    { translate: `${across}px ${rise}px`, scale: String(small), opacity: 0 },
  ];
  if (!up) {
    frames.reverse();
    line.style.color = 'transparent';
  }
  const flight = words.animate(frames, { duration: 480, easing: EASE, fill: 'both' });
  flying = flight;
  void flight.finished.catch(() => undefined).then(() => {
    words.remove();
    line.style.color = '';
  });
};
