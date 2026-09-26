// ═══════════════════════════════════════════════════════════════
// LYCEUM'S LOOK — the poster. Every visual decision is here, as tokens and
// the rules that read them; the components (./kit.ts) only say WHAT a thing is
// (an area, an ink, a mark), never how it looks, and take no style from a
// layout. A different look is a different stylesheet over the same kit.
//
// The grammar:
//   · A screen is a SHEET: a ruled grid. The rules are the grid's gaps showing
//     the ink underneath — cells never draw borders.
//   · Everything is a CELL. Paper by default; a block of INK only where it
//     carries a fact (the live count, the one primary action).
//   · Four colours: paper, ink, signal, alert. Houses are not colours — they
//     are MARKS (a pattern) and SIGILS (a shape), so the inks stay free to mean
//     something.
//   · "Not yet" has a pattern, the hatch — never a grey.
//   · Two voices: Unbounded for what is read from the back row, Space
//     Grotesk for sentences, Space Mono for code and data. Sizes follow the
//     cell's own width (container units), so one layout reads on a projector
//     and on a phone.
// ═══════════════════════════════════════════════════════════════

export const ROOT_CLASS = 'lyceum';

export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Space+Grotesk:wght@400;500&family=Space+Mono:wght@400;700&display=swap';

export const LYCEUM_CSS = `
html, body { margin: 0; padding: 0; }
.${ROOT_CLASS} {
  --paper: #ffffff; --ink: #000000; --signal: #1400ff; --alert: #ff3b00;
  --rule: 3px;
  --display: 'Unbounded', 'Arial Black', sans-serif;
  --prose: 'Space Grotesk', system-ui, sans-serif;
  --mono: 'Space Mono', ui-monospace, monospace;
  color-scheme: light; background: var(--paper); color: var(--ink);
  font: 16px/1.4 var(--prose); min-height: 100dvh;
}
.${ROOT_CLASS} * { box-sizing: border-box; margin: 0; }

/* ── the frame: canvases stacked, the last one filling what is left ── */
.${ROOT_CLASS} .page { display: flex; flex-direction: column; height: 100dvh; }
.${ROOT_CLASS} .page > [data-canvas] { display: flex; flex-direction: column; min-height: 0; }
.${ROOT_CLASS} .page > [data-canvas]:last-child { flex: 1 1 auto; }
.${ROOT_CLASS} .page > [data-canvas] > * { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
/* stacked canvases share one rule where they meet, not two */
.${ROOT_CLASS} .page > [data-canvas]:not(:empty) ~ [data-canvas] > * > .sheet { border-top: 0; }

/* ── sheet: the ruled grid ── */
.${ROOT_CLASS} .sheet {
  display: grid; gap: var(--rule); background: var(--ink); border: var(--rule) solid var(--ink);
  container-type: inline-size;
}
.${ROOT_CLASS} .sheet[data-size="fill"] { flex: 1 1 auto; min-height: 0; }

/* ── cell: a place in the grid, and its ink ── */
/* defaults first, so an ink always out-ranks them */
.${ROOT_CLASS} :where(.cell, .bar > span, .action) { --bg: var(--paper); --fg: var(--ink); }
.${ROOT_CLASS} [data-ink="ink"] { --bg: var(--ink); --fg: var(--paper); }
.${ROOT_CLASS} [data-ink="signal"] { --bg: var(--signal); --fg: var(--paper); }
.${ROOT_CLASS} [data-ink="alert"] { --bg: var(--alert); --fg: var(--ink); }
.${ROOT_CLASS} .cell {
  background: var(--bg); color: var(--fg);
  padding: clamp(8px, 1.2cqw, 22px) clamp(10px, 1.5cqw, 28px);
  display: flex; flex-direction: column; gap: clamp(4px, .6cqw, 12px); min-width: 0; overflow: hidden;
}
.${ROOT_CLASS} .cell[data-align="end"] { justify-content: flex-end; }
.${ROOT_CLASS} .cell[data-align="center"] { justify-content: center; align-items: center; text-align: center; }
.${ROOT_CLASS} .cell[data-align="between"] { justify-content: space-between; }
.${ROOT_CLASS} .cell[data-pad="none"] { padding: 0; }

/* ── marks: the houses' patterns, and the hatch of "not yet" ── */
.${ROOT_CLASS} [data-mark="stripes"] { background: repeating-linear-gradient(-45deg, var(--fg) 0 4px, var(--bg) 4px 14px); }
.${ROOT_CLASS} [data-mark="dots"]    { background: radial-gradient(var(--fg) 2.2px, var(--bg) 2.6px) 0 0 / 12px 12px; }
.${ROOT_CLASS} [data-mark="bars"]    { background: repeating-linear-gradient(90deg, var(--fg) 0 5px, var(--bg) 5px 15px); }
.${ROOT_CLASS} [data-mark="checks"]  { background: repeating-conic-gradient(var(--fg) 0 25%, var(--bg) 0 50%) 0 0 / 18px 18px; }
.${ROOT_CLASS} [data-mark="hatch"]   { background: repeating-linear-gradient(-45deg, var(--fg) 0 1px, var(--bg) 1px 7px); }
.${ROOT_CLASS} [data-mark] > * { background: var(--bg); padding: .15em .4em; width: fit-content; }

/* ── type ── */
.${ROOT_CLASS} .label {
  font: 700 clamp(10px, 1.15cqw, 20px)/1.2 var(--display); letter-spacing: .08em; text-transform: uppercase;
}
.${ROOT_CLASS} .headline { font-family: var(--display); font-weight: 900; text-transform: uppercase; line-height: .92; overflow-wrap: anywhere; }
.${ROOT_CLASS} .headline[data-level="display"] { font-size: clamp(34px, 7cqw, 170px); }
.${ROOT_CLASS} .headline[data-level="title"]   { font-size: clamp(22px, 3.8cqw, 96px); }
.${ROOT_CLASS} .headline[data-level="name"]    { font-size: clamp(18px, 2.4cqw, 56px); line-height: 1; }
.${ROOT_CLASS} .text { font-size: clamp(15px, 1.75cqw, 34px); line-height: 1.35; }
.${ROOT_CLASS} .text[data-tone="muted"] { opacity: 1; color: color-mix(in srgb, var(--fg) 55%, var(--bg)); }
.${ROOT_CLASS} .figure { display: flex; flex-direction: column; gap: .3em; }
.${ROOT_CLASS} .figure > .value { font: 900 clamp(30px, 6cqw, 150px)/.85 var(--display); }

/* ── code: a cell of mono, the lines that matter marked in signal ── */
.${ROOT_CLASS} .code { font: 400 clamp(11px, 1.45cqw, 26px)/1.5 var(--mono); white-space: pre; overflow: hidden; }
.${ROOT_CLASS} .code > span { display: block; }
.${ROOT_CLASS} .code > span[data-marked] { background: var(--signal); color: var(--paper); margin: 0 -.4em; padding: 0 .4em; }

/* ── rows: a ruled table, headers in the label voice ── */
.${ROOT_CLASS} .rows { display: grid; gap: var(--rule); background: var(--ink); }
.${ROOT_CLASS} .rows > div { display: grid; grid-template-columns: var(--cols); gap: var(--rule); }
.${ROOT_CLASS} .rows > div > span { background: var(--paper); color: var(--ink); padding: .35em .6em; font-size: clamp(13px, 1.5cqw, 28px); display: flex; align-items: center; gap: .4em; min-width: 0; overflow: hidden; }
.${ROOT_CLASS} .rows > div:first-child > span { font: 700 clamp(9px, 1.05cqw, 18px)/1.2 var(--display); letter-spacing: .08em; text-transform: uppercase; }
.${ROOT_CLASS} .rows [data-kind="mono"] { font-family: var(--mono); }
.${ROOT_CLASS} .rows [data-kind="missing"] { color: color-mix(in srgb, var(--ink) 45%, var(--paper)); }
.${ROOT_CLASS} .rows > .empty { display: block; background: var(--paper); padding: .6em; }

/* ── sigils: the houses' shapes ── */
.${ROOT_CLASS} .sigil { width: 1em; height: 1em; flex: none; display: inline-block; vertical-align: -.12em; }
.${ROOT_CLASS} .sigil[data-size="large"] { width: clamp(48px, 12cqw, 260px); height: clamp(48px, 12cqw, 260px); }
.${ROOT_CLASS} .sigil * { fill: currentColor; }

/* ── bar: proportions as cells ── */
.${ROOT_CLASS} .bar { display: grid; gap: var(--rule); background: var(--ink); min-height: clamp(14px, 2cqw, 40px); }
/* a segment takes its ink and mark from the same rules a cell does — the
   default here must not out-rank them */
.${ROOT_CLASS} .bar > span:not([data-mark]) { background: var(--bg); }

/* ── action: a whole cell you press ── */
.${ROOT_CLASS} .action {
  background: var(--bg); color: var(--fg); border: 0; cursor: pointer; text-align: left;
  padding: clamp(10px, 1.4cqw, 26px) clamp(12px, 1.6cqw, 30px);
  font: 900 clamp(14px, 1.8cqw, 34px)/1 var(--display); text-transform: uppercase; letter-spacing: .02em;
}
.${ROOT_CLASS} .action:active { background: var(--fg); color: var(--bg); }
.${ROOT_CLASS} .action:focus-visible { outline: var(--rule) solid var(--alert); outline-offset: calc(var(--rule) * -1); }
`;
