import type { LayoutNode } from '@niscorp/nova';

// What an answer did to a card: put it on the screen, or wrote into one that was there.
export type Mark = 'changed' | 'new';

export type Place = { span: number; row: number; column: number; ink: string; fresh?: Mark };

// Cards row by row as `columns` lays them out, each with the ink of the answer that put it there. A last row left short
// is closed by its last card taking the rest of the row.
export const placesOf = (columns: number, cards: readonly { span: number; ink: string; mark?: Mark }[]): Place[] => {
  let row = 1;
  let used = 0;
  const places = cards.map(({ span: asked, ink, mark }): Place => {
    const span = Math.min(asked, columns);
    if (used + span > columns) {
      row += 1;
      used = 0;
    }
    const column = used + 1;
    used += span;
    return { span, row, column, ink, ...(mark === undefined ? {} : { fresh: mark }) };
  });
  const last = places[places.length - 1];
  return last === undefined || used === columns ? places : [...places.slice(0, -1), { ...last, span: columns - last.column + 1 }];
};

// The screen canvas laid out: a grid told which answer it shows, and an area for each of the canvas's instances in
// order, the first in the first.
export const screenLayout = (columns: number, places: readonly Place[], at: number): LayoutNode => ({
  component: 'Grid',
  props: { columns, at },
  children: places.map((place, index) => ({
    component: 'Area',
    props: { name: String(index + 1), ...place },
    children: [{ component: 'ActionSlot', props: { instanceId: `$.instances.${String(index)}.id` } }],
  })),
});
