import type { CheerioAPI } from 'cheerio';
import { isTag, type Element } from 'domhandler';

const span = (cell: Element, name: 'rowspan' | 'colspan') =>
  Math.max(1, Math.min(1000, Number.parseInt(cell.attribs[name] ?? '1', 10) || 1));

// A cell that spans rows is copied into each row it covers, so a row's n-th cell is its n-th column in every row:
// a rule like `td:nth-child(2)` then reads the same column after a merged cell as before it. Discovery and every run
// read pages through this.
export const spreadMergedCells = ($: CheerioAPI): void => {
  for (const table of $('table').toArray()) {
    const rows = $(table)
      .find('tr')
      .toArray()
      .filter((row) => $(row).closest('table')[0] === table);
    if (!rows.some((row) => $(row).children('td[rowspan], th[rowspan]').length)) continue;
    // Column → the cell still spanning down into later rows, and how many rows it has left.
    const pending = new Map<number, { cell: Element; left: number; width: number }>();
    for (const row of rows) {
      const cells = $(row).children('td, th').toArray().filter(isTag);
      let column = 0;
      const place = (before: Element) => {
        for (let hold = pending.get(column); hold; hold = pending.get(column)) {
          $(before).before($(hold.cell).clone().removeAttr('rowspan'));
          hold.left--;
          if (!hold.left) pending.delete(column);
          column += hold.width;
        }
      };
      for (const cell of cells) {
        place(cell);
        const width = span(cell, 'colspan');
        const down = span(cell, 'rowspan');
        if (down > 1) {
          pending.set(column, { cell, left: down - 1, width });
          $(cell).removeAttr('rowspan');
        }
        column += width;
      }
      for (const [at, hold] of [...pending].sort((a, b) => a[0] - b[0])) {
        if (at < column) continue;
        $(row).append($(hold.cell).clone().removeAttr('rowspan'));
        hold.left--;
        if (!hold.left) pending.delete(at);
      }
    }
  }
};
