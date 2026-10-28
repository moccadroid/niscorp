export type Box = { left: number; top: number; width: number; height: number };

// One card as the page holds it: which card it is, what it says, where it rests.
export type Card = { element: HTMLElement; id: string; says: string; box: Box };

export const gridOf = (): HTMLElement | null => document.querySelector<HTMLElement>('.k-frame > .k-grid');

const boxIn = (element: Element, base: DOMRect): Box => {
  const r = element.getBoundingClientRect();
  return { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height };
};

// A card is what its words and its ink say; the mark above it is not part of it.
const saysOf = (area: HTMLElement): string => `${area.dataset['ink'] ?? ''}|${area.querySelector('.k-card')?.textContent ?? ''}`;

// The cards as they rest, top to bottom, with the boxes the grid gives them when nothing holds it.
export const cardsOf = (grid: HTMLElement, instances: ReadonlyMap<string, string>): Card[] => {
  const held = { flex: grid.style.flex, height: grid.style.height };
  grid.style.flex = '';
  grid.style.height = '';
  const base = grid.getBoundingClientRect();
  const cards = [...grid.querySelectorAll<HTMLElement>(':scope > .k-area')]
    .filter((area) => area.offsetHeight > 0)
    .map((area) => {
      const name = area.dataset['name'] ?? '';
      return { element: area, id: instances.get(name) ?? `area:${name}`, says: saysOf(area), box: boxIn(area, base) };
    });
  Object.assign(grid.style, held);
  return cards;
};

export const restingHeight = (grid: HTMLElement): number => {
  const held = { flex: grid.style.flex, height: grid.style.height };
  grid.style.flex = '';
  grid.style.height = '';
  const height = grid.offsetHeight;
  Object.assign(grid.style, held);
  return height;
};

// A copy of a card that looks as the card does where it stands now, whatever it is put beside: what the page works out
// from its place among the others is written onto it. Its padding goes on a skin inside it, so the copy itself can be
// made as short as a move needs.
export const copyOf = (area: HTMLElement): HTMLElement => {
  const copy = area.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error('mira: a card copied as something else.');
  const style = getComputedStyle(area);
  for (const name of ['--c', '--ink']) copy.style.setProperty(name, style.getPropertyValue(name));
  copy.style.display = style.display;
  copy.style.padding = '0';
  const skin = document.createElement('div');
  skin.className = 'k-skin';
  skin.style.padding = style.padding;
  skin.append(...copy.childNodes);
  copy.append(skin);
  sizeTitles(copy, area);
  const fields = area.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((field, at) => field.setAttribute('value', fields[at]?.value ?? ''));
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  return copy;
};

// Where a stage stands: over the grid, in the frame, above the dock unless the dock is lifted over the answer.
export const stageOver = (grid: HTMLElement, fixed: boolean): HTMLElement => {
  const stage = document.createElement('div');
  stage.className = 'k-stage';
  if (fixed) {
    const r = grid.getBoundingClientRect();
    Object.assign(stage.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px` });
    document.body.append(stage);
  } else {
    Object.assign(stage.style, { top: `${grid.offsetTop}px`, left: `${grid.offsetLeft}px`, width: `${grid.offsetWidth}px` });
    grid.parentElement?.append(stage);
  }
  return stage;
};

// A title is the size its card's place gives it: smaller while the card is folded.
export const sizeTitles = (copy: HTMLElement, area: HTMLElement): void => {
  const titles = area.querySelectorAll<HTMLElement>('.k-card-title');
  copy.querySelectorAll<HTMLElement>('.k-card-title').forEach((title, at) => {
    const from = titles[at];
    if (from !== undefined) title.style.fontSize = getComputedStyle(from).fontSize;
  });
};

export const place = (element: HTMLElement, box: Pick<Box, 'left' | 'width'> & { top: number; height: number }): void => {
  Object.assign(element.style, { left: `${box.left}px`, width: `${box.width}px`, top: `${box.top}px`, height: `${box.height}px` });
};

// While a move is drawn, the page's own cards are laid out unseen under it.
export const hideGrid = (hidden: boolean): void => {
  document.documentElement.toggleAttribute('data-moving', hidden);
};
