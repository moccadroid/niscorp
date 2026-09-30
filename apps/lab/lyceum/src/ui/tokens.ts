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
//   · Four colours, each with a job, on paper and ink: SIGNAL (blue) is the
//     fact that matters, ALERT (orange) is what to do next, LIVE (green) is a
//     number that changes on its own, HIGHLIGHT (yellow) is what the pointer
//     is on and what the eye should find. Houses are not colours — they are
//     MARKS (a pattern) and SIGILS (a shape), so the colours stay free to mean
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
/* THE READING SIZE. A size below is clamp(the reading floor, the poster
   size, a cap). Posters — the projector — scale: its rem follows the screen
   (~27px on a 1080p projector), and its sizes follow their sheet (cqw), read
   from the back row. Every other screen — the controller, a phone, the door —
   is WORKED at arm's length: 16px rem, and every size at its floor, however
   wide the window. \`--cq\` is the switch: 1cqw on the projector, 0 elsewhere,
   so \`calc(N * var(--cq))\` is a poster size there and nothing here. (An
   unregistered custom property is substituted where it is used, so its cqw is
   the using element's own container.) */
html { font-size: 16px; }
html:has(.page > [data-canvas="strip"]:not(:empty)) { font-size: clamp(16px, calc(0.72vw + 13.3px), 28px); }
.${ROOT_CLASS} {
  --paper: #ffffff; --ink: #000000; --signal: #1400ff; --alert: #ff3b00; --live: #00c853; --highlight: #ffe600;
  --rule: 3px;
  --display: 'Unbounded', 'Arial Black', sans-serif;
  --prose: 'Space Grotesk', system-ui, sans-serif;
  --mono: 'Space Mono', ui-monospace, monospace;
  color-scheme: light; background: var(--paper); color: var(--ink);
  font: 400 1rem/1.4 var(--prose); min-height: 100dvh;
  --cq: 0px;
}
.${ROOT_CLASS} .page:has(> [data-canvas="strip"]:not(:empty)) { --cq: 1cqw; }
.${ROOT_CLASS} * { box-sizing: border-box; margin: 0; }

/* ── the frame: canvases stacked, the last one filling what is left ── */
.${ROOT_CLASS} .page { display: flex; flex-direction: column; height: 100dvh; }
/* a phone's notch and home bar are not the page: nothing to press sits under
   them (the page keeps viewport-fit=cover, so these are real on a phone and
   zero everywhere else). The edge they leave is ink, like the rules. */
.${ROOT_CLASS} .page { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); background: var(--ink); }
/* the projector has no controls: no pointer on it either */
.${ROOT_CLASS} .page:has(> [data-canvas="strip"]:not(:empty)) { cursor: none; }
.${ROOT_CLASS} .page > [data-canvas] { display: flex; flex-direction: column; min-height: 0; }
.${ROOT_CLASS} .page > [data-canvas]:not(:empty):not(:has(~ [data-canvas]:not(:empty))) { flex: 1 1 auto; }
.${ROOT_CLASS} .page > [data-canvas] > * { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
/* the look marker takes no room: the terminal reads it (target.ts) */
.${ROOT_CLASS} .page > [data-canvas="look"] { display: none; }
/* the overlay canvas: over the whole screen when something is open, out of
   the stack either way */
.${ROOT_CLASS} .page > [data-canvas="overlay"]:not(:empty) {
  position: fixed; inset: 0; z-index: 10;
  /* the screen underneath stays visible, dimmed: this is ON it, not instead of it */
  background: color-mix(in srgb, var(--ink) 55%, transparent);
  padding: calc(12dvh + env(safe-area-inset-top)) clamp(10px, 4vw, 48px) calc(clamp(10px, 4vw, 48px) + env(safe-area-inset-bottom));
}
/* the panel ends where its content does, up to the screen's edge — past that its
   body scrolls inside it (fifty slides) */
.${ROOT_CLASS} .page > [data-canvas="overlay"]:not(:empty) > * { flex: 0 1 auto; }
.${ROOT_CLASS} .page > [data-canvas="overlay"]:not(:empty) > * > .sheet { flex: 0 1 auto; border-top: var(--rule) solid var(--ink); max-width: 720px; width: 100%; margin: 0 auto; box-shadow: 8px 8px 0 var(--ink); }
/* stacked canvases share one rule where they meet, not two */
.${ROOT_CLASS} .page > [data-canvas]:not(:empty):not([data-canvas="overlay"]) ~ [data-canvas] > * > .sheet { border-top: 0; }

/* ── sheet: the ruled grid ── */
.${ROOT_CLASS} .sheet {
  display: grid; gap: var(--rule); background: var(--ink); border: var(--rule) solid var(--ink);
  container-type: inline-size;
}
.${ROOT_CLASS} .sheet[data-size="fill"] { flex: 1 1 auto; min-height: 0; }
/* A NARROW ARRANGEMENT: a sheet that declares one (props.narrow) takes it on a
   phone-width screen — its own areas, rows and columns, set as variables by
   the kit, and the cells it leaves out are not shown. The inline template is
   the wide one, so this has to out-rank it. */
@media (max-width: 640px) {
  .${ROOT_CLASS} .sheet[data-narrow] { grid-template-areas: var(--narrow-areas) !important; grid-template-rows: var(--narrow-rows) !important; grid-template-columns: var(--narrow-cols) !important; }
  .${ROOT_CLASS} .sheet[data-narrow] > [data-narrow-hidden] { display: none; }
}
/* a sheet inside a cell is part of that cell's grid: its rules, not a second frame */
.${ROOT_CLASS} .cell > .sheet { border: 0; }

/* a canvas placed by an action's own layout (the controller's regions) fills
   its cell, and its sheet is part of the outer grid — its rules, not a frame */
.${ROOT_CLASS} .cell > [data-canvas] { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
/* several actions in one region (a list canvas) stack; the last takes what is left */
.${ROOT_CLASS} .cell > [data-canvas] > * { display: flex; flex-direction: column; flex: 0 0 auto; }
.${ROOT_CLASS} .cell > [data-canvas] > *:last-child { flex: 1 1 auto; min-height: 0; }
/* a sheet that fills takes the region; any other is as tall as it is, with its
   own rule under it and the region's paper below */
.${ROOT_CLASS} .cell > [data-canvas] > * > .sheet { border: 0; flex: 0 0 auto; border-bottom: var(--rule) solid var(--ink); }
.${ROOT_CLASS} .cell > [data-canvas] > * > .sheet[data-size="fill"] { flex: 1 1 auto; border-bottom: 0; }

/* the phone's tabs: side by side, equally wide, one rule between them — not
   stacked like the other list regions */
.${ROOT_CLASS} .cell > [data-canvas="tabs"] { flex-direction: row; gap: var(--rule); background: var(--ink); overflow: hidden; }
.${ROOT_CLASS} .cell > [data-canvas="tabs"] > *,
.${ROOT_CLASS} .cell > [data-canvas="tabs"] > *:last-child { flex: 1 1 0; min-width: 0; }

/* ── cell: a place in the grid, and its ink ── */
/* defaults first, so an ink always out-ranks them */
.${ROOT_CLASS} :where(.cell, .bar > span, .action, .flow-lane) { --bg: var(--paper); --fg: var(--ink); }
.${ROOT_CLASS} :where(.columns-fill) { --bg: var(--ink); --fg: var(--paper); }
.${ROOT_CLASS} [data-ink="ink"] { --bg: var(--ink); --fg: var(--paper); }
.${ROOT_CLASS} [data-ink="signal"] { --bg: var(--signal); --fg: var(--paper); }
.${ROOT_CLASS} [data-ink="alert"] { --bg: var(--alert); --fg: var(--ink); }
.${ROOT_CLASS} [data-ink="live"] { --bg: var(--live); --fg: var(--ink); }
.${ROOT_CLASS} [data-ink="highlight"] { --bg: var(--highlight); --fg: var(--ink); }
.${ROOT_CLASS} .cell {
  background: var(--bg); color: var(--fg);
  padding: clamp(.55rem, calc(1.2 * var(--cq)), 1.4rem) clamp(.7rem, calc(1.5 * var(--cq)), 1.75rem);
  display: flex; flex-direction: column; gap: clamp(.3rem, calc(.6 * var(--cq)), .75rem); min-width: 0; overflow: hidden;
}
.${ROOT_CLASS} .cell[data-align="end"] { justify-content: flex-end; }
.${ROOT_CLASS} .cell[data-align="center"] { justify-content: center; align-items: center; text-align: center; }
.${ROOT_CLASS} .cell[data-align="between"] { justify-content: space-between; }
.${ROOT_CLASS} .cell[data-pad="none"] { padding: 0; }
.${ROOT_CLASS} .cell[data-scroll="y"] { overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
/* held at its end: a reversed column opens scrolled to its last line, and the
   screen is rebuilt on every update, so it stays there */
.${ROOT_CLASS} .cell[data-scroll="end"] { overflow-y: auto; min-height: 0; overscroll-behavior: contain; flex-direction: column-reverse; }

/* ── marks: the houses' patterns, and the hatch of "not yet" ── */
.${ROOT_CLASS} [data-mark="stripes"] { background: repeating-linear-gradient(-45deg, var(--fg) 0 4px, var(--bg) 4px 14px); }
.${ROOT_CLASS} [data-mark="dots"]    { background: radial-gradient(var(--fg) 2.2px, var(--bg) 2.6px) 0 0 / 12px 12px; }
.${ROOT_CLASS} [data-mark="bars"]    { background: repeating-linear-gradient(90deg, var(--fg) 0 5px, var(--bg) 5px 15px); }
.${ROOT_CLASS} [data-mark="checks"]  { background: repeating-conic-gradient(var(--fg) 0 25%, var(--bg) 0 50%) 0 0 / 18px 18px; }
.${ROOT_CLASS} [data-mark="hatch"]   { background: repeating-linear-gradient(-45deg, var(--fg) 0 1px, var(--bg) 1px 7px); }
.${ROOT_CLASS} [data-mark] > * { background: var(--bg); padding: .15em .4em; width: fit-content; }

/* ── type ── */
.${ROOT_CLASS} .label {
  font: 700 clamp(.78rem, calc(1.15 * var(--cq)), 1.2rem)/1.2 var(--display); letter-spacing: .08em; text-transform: uppercase;
}
.${ROOT_CLASS} .headline { font-family: var(--display); font-weight: 900; text-transform: uppercase; line-height: .92; overflow-wrap: break-word; hyphens: none; }
.${ROOT_CLASS} .headline[data-level="display"] { font-size: clamp(2.2rem, calc(7 * var(--cq)), 170px); }
.${ROOT_CLASS} .headline[data-level="title"]   { font-size: clamp(1.6rem, calc(3.8 * var(--cq)), 96px); }
.${ROOT_CLASS} .headline[data-level="name"]    { font-size: clamp(1.25rem, calc(1.9 * var(--cq)), 44px); line-height: 1.05; }
.${ROOT_CLASS} .text { font-size: clamp(1.06rem, calc(1.75 * var(--cq)), 2.2rem); line-height: 1.35; }
.${ROOT_CLASS} .text[data-tone="muted"] { opacity: 1; color: color-mix(in srgb, var(--fg) 55%, var(--bg)); }
.${ROOT_CLASS} .figure { display: flex; flex-direction: column; gap: .3em; }
.${ROOT_CLASS} .figure > .value { font: 900 clamp(2rem, calc(6 * var(--cq)), 150px)/.85 var(--display); }
/* a countdown reads as a clock: figures that do not jump as they change */
.${ROOT_CLASS} .countdown > .value { font-variant-numeric: tabular-nums; }

/* ── code: a cell of mono, the lines that matter highlighted ── */
.${ROOT_CLASS} .code { font: 400 clamp(.8rem, calc(1.6 * var(--cq)), 1.5rem)/1.5 var(--mono); white-space: pre; overflow: hidden; }
.${ROOT_CLASS} .code > span { display: block; }
/* code in a cell that scrolls (a phone reading a document, not a slide showing
   one) wraps its long lines instead of cutting them off */
.${ROOT_CLASS} .cell[data-scroll] .code { white-space: pre-wrap; overflow-wrap: anywhere; }
.${ROOT_CLASS} .code > span[data-marked] { background: var(--highlight); color: var(--ink); margin: 0 -.4em; padding: 0 .4em; }

/* ── rows: a ruled table, headers in the label voice ── */
.${ROOT_CLASS} .rows { display: grid; gap: var(--rule); background: var(--ink); }
.${ROOT_CLASS} .rows > div { display: grid; grid-template-columns: var(--cols); gap: var(--rule); }
.${ROOT_CLASS} .rows > div > span { background: var(--paper); color: var(--ink); padding: .4em .6em; font-size: clamp(1rem, calc(1.5 * var(--cq)), 1.6rem); display: flex; align-items: center; gap: .4em; min-width: 0; overflow: hidden; }
.${ROOT_CLASS} .rows[data-head] > div:first-child > span { font: 700 clamp(.7rem, calc(1.05 * var(--cq)), 1.1rem)/1.2 var(--display); letter-spacing: .08em; text-transform: uppercase; }
.${ROOT_CLASS} .rows [data-kind="mono"] { font-family: var(--mono); }
.${ROOT_CLASS} .rows [data-kind="missing"] { color: color-mix(in srgb, var(--ink) 45%, var(--paper)); }
.${ROOT_CLASS} .rows > .empty { display: block; background: var(--paper); padding: .6em; }
/* a row you can press: the same highlight as every other pressable thing; the
   selected row wears the signal */
.${ROOT_CLASS} .rows > [data-press] { cursor: pointer; }
@media (hover: hover) { .${ROOT_CLASS} .rows > [data-press]:hover > span { background: var(--highlight); color: var(--ink); } }
.${ROOT_CLASS} .rows > [data-selected] > span { background: var(--signal); color: var(--paper); }

/* ── sigils: the houses' shapes ── */
.${ROOT_CLASS} .sigil { width: 1em; height: 1em; flex: none; display: inline-block; vertical-align: -.12em; }
.${ROOT_CLASS} .sigil[data-size="large"] { width: clamp(48px, calc(12 * var(--cq)), 260px); height: clamp(48px, calc(12 * var(--cq)), 260px); }
.${ROOT_CLASS} .sigil * { fill: currentColor; }

/* ── bar: proportions as cells ── */
.${ROOT_CLASS} .bar { display: grid; gap: var(--rule); background: var(--ink); min-height: clamp(14px, calc(2 * var(--cq)), 40px); }
/* a segment takes its ink and mark from the same rules a cell does — the
   default here must not out-rank them */
.${ROOT_CLASS} .bar > span:not([data-mark]) { background: var(--bg); }

/* ── field: a line you type into — a whole cell of it ──
   It must read as INPUT among cells that are all paper, so it is drawn the way
   a printed form draws one: a writing line in ink under the text, set in from
   the cell's edges, on a faintly recessed ground; the caret is the alert ink. */
.${ROOT_CLASS} .field {
  --pad-x: clamp(.8rem, calc(1.6 * var(--cq)), 1.8rem);
  --pad-y: clamp(.9rem, calc(1.6 * var(--cq)), 1.8rem);
  --well: color-mix(in srgb, var(--ink) 6%, var(--paper));
  border: 0; outline: 0; width: 100%; color: var(--ink); caret-color: var(--alert);
  padding: var(--pad-y) var(--pad-x);
  background:
    linear-gradient(var(--ink), var(--ink)) no-repeat left var(--pad-x) bottom calc(var(--pad-y) * .55) / calc(100% - var(--pad-x) * 2) var(--rule),
    var(--well);
  /* never under 16px: a phone zooms the page into a smaller field */
  font: 500 clamp(1.1rem, calc(2.2 * var(--cq)), 2.4rem)/1.2 var(--prose);
}
.${ROOT_CLASS} .field::placeholder { color: color-mix(in srgb, var(--ink) 40%, var(--paper)); }
.${ROOT_CLASS} .field:focus { --well: var(--highlight); }

/* ── qr: ink on paper whatever the cell's ink, square, as large as its place ── */
.${ROOT_CLASS} .qr { display: block; position: relative; flex: 1 1 auto; min-height: 0; }
/* the svg keeps its square inside whatever box it gets (xMidYMid meet) */
.${ROOT_CLASS} .qr > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.${ROOT_CLASS} .qr .qr-ground { fill: var(--paper); }
.${ROOT_CLASS} .qr path { fill: var(--ink); }

/* ── flow: two ends, and what passes between them ──
   A lane is a cell; its dots are its ink's foreground, running along a rule
   toward the end the lane names. They never stop (the kit starts each lane
   where the wall clock says it is, so a re-render does not make them jump). */
.${ROOT_CLASS} .flow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--rule); background: var(--ink); flex: 1 1 auto; min-height: 0; }
.${ROOT_CLASS} .flow-end {
  background: var(--ink); color: var(--paper); display: flex; align-items: center; justify-content: center; text-align: center;
  padding: clamp(.6rem, calc(1.2 * var(--cq)), 1.4rem);
  font: 900 clamp(1rem, calc(2.2 * var(--cq)), 56px)/1 var(--display); text-transform: uppercase; max-width: 5.5em;
}
.${ROOT_CLASS} .flow-lanes { display: grid; gap: var(--rule); background: var(--ink); }
.${ROOT_CLASS} .flow-lane { background: var(--bg); color: var(--fg); display: flex; flex-direction: column; justify-content: center; gap: clamp(.4rem, calc(1 * var(--cq)), 1.2rem); padding: clamp(.6rem, calc(1.2 * var(--cq)), 1.4rem) clamp(.8rem, calc(1.8 * var(--cq)), 2rem); }
.${ROOT_CLASS} .flow-track { position: relative; height: clamp(12px, calc(1.8 * var(--cq)), 40px); background: linear-gradient(var(--fg), var(--fg)) center / 100% var(--rule) no-repeat; }
.${ROOT_CLASS} .flow-dot {
  position: absolute; top: 50%; left: 0; width: clamp(12px, calc(1.8 * var(--cq)), 40px); aspect-ratio: 1; background: var(--fg);
  transform: translate(-50%, -50%); animation: flow-to 2400ms linear infinite;
}
.${ROOT_CLASS} .flow-lane[data-toward="from"] .flow-dot { animation-name: flow-from; }
@keyframes flow-to { from { left: 0%; } to { left: 100%; } }
@keyframes flow-from { from { left: 100%; } to { left: 0%; } }

/* ── columns: numbers as bars, standing on one rule ── */
.${ROOT_CLASS} .columns { --value: clamp(1.1rem, calc(2.8 * var(--cq)), 72px); display: flex; gap: clamp(.6rem, calc(1.6 * var(--cq)), 2rem); flex: 1 1 auto; min-height: clamp(160px, calc(20 * var(--cq)), 520px); }
.${ROOT_CLASS} .columns-bar { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: .35em; }
.${ROOT_CLASS} .columns-value { position: absolute; bottom: 100%; left: 0; padding-bottom: .12em; font: 900 var(--value)/1 var(--display); }
.${ROOT_CLASS} .columns-track { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; padding-top: calc(var(--value) * 1.2); border-bottom: var(--rule) solid currentColor; }
.${ROOT_CLASS} .columns-fill { position: relative; width: 100%; flex: none; background: var(--bg); }

/* ── a slide arriving: its cells wipe in, one after the next ──
   Only when the slide itself changes — the terminal (./target.ts) marks the
   page for the moment after a new slide mounts, and says how far into it a
   re-render lands, so a count changing mid-way does not start it over. Every
   other update paints still. */
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell {
  animation: enter 520ms cubic-bezier(.2, .8, .2, 1) both;
  animation-delay: calc(var(--i, 0) * 110ms - var(--enter-elapsed, 0ms));
}
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(1) { --i: 0; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(2) { --i: 1; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(3) { --i: 2; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(4) { --i: 3; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(5) { --i: 4; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(6) { --i: 5; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(7) { --i: 6; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(8) { --i: 7; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(9) { --i: 8; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(10) { --i: 9; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(11) { --i: 10; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(12) { --i: 11; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(13) { --i: 12; }
.${ROOT_CLASS}[data-enter] .page > [data-canvas="main"] > * > .sheet > .cell:nth-child(14) { --i: 13; }
@keyframes enter { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }

/* ── action: a whole cell you press ── */
.${ROOT_CLASS} .action {
  background: var(--bg); color: var(--fg); border: 0; cursor: pointer; text-align: left;
  padding: clamp(.8rem, calc(1.4 * var(--cq)), 1.6rem) clamp(.9rem, calc(1.6 * var(--cq)), 1.8rem);
  font: 900 clamp(1rem, calc(1.8 * var(--cq)), 2rem)/1.1 var(--display); text-transform: uppercase; letter-spacing: .02em;
  /* a thumb's width at least, whatever the label */
  min-height: max(3.25rem, 48px);
}
/* the one thing a screen is for — the door's Step in */
.${ROOT_CLASS} .action[data-size="large"] { min-height: max(5.5rem, 72px); font-size: clamp(1.4rem, calc(3 * var(--cq)), 3rem); }
.${ROOT_CLASS} .action[data-lines="two"] > span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; height: 2em; }

/* ── anything you can press ──
   Whatever carries a \`ref\` is clickable (nova wires the click by that
   convention), so the affordance keys on the same thing: [data-ref]. No
   component opts in and no layout can opt out.
   HOVER IS THE HIGHLIGHT: whatever ink the cell wore, under the pointer it
   is yellow and black — a hard cut, no easing, the poster's one motion.
   PRESSED is the hatch over it. Hover is only where a pointer can hover: on a
   phone a tap must not leave a cell stuck lit. */
.${ROOT_CLASS} [data-ref]:not(input) { cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
@media (hover: hover) {
  .${ROOT_CLASS} [data-ref]:not(input):hover { --bg: var(--highlight); --fg: var(--ink); background: var(--bg); color: var(--fg); }
}
.${ROOT_CLASS} [data-ref]:not(input):active { --bg: var(--highlight); --fg: var(--ink); background: repeating-linear-gradient(-45deg, var(--ink) 0 2px, var(--highlight) 2px 8px); color: var(--ink); }
.${ROOT_CLASS} [data-ref]:focus-visible { outline: var(--rule) solid var(--alert); outline-offset: calc(var(--rule) * -1); }
.${ROOT_CLASS} .action[data-ink="alert"]:focus-visible { outline-color: var(--signal); }

/* WHICH RENDERER DREW THIS: the React and Vue kits put their name in the
   bottom corner of the page (the DOM kit, the default, puts none). */
.${ROOT_CLASS} .page > .renderer {
  position: fixed; right: 0; bottom: 0; z-index: 10; pointer-events: none;
  padding: .2em .6em; background: var(--signal); color: var(--paper);
  font: 700 clamp(.7rem, calc(.9 * var(--cq)), 1rem)/1.2 var(--mono); letter-spacing: .06em; text-transform: uppercase;
}

/* THE X-RAY: the screen as it is, with every action on it outlined and its id
   in the corner — nested the way the screen is composed. The tag is the one
   thing to tap: it opens that action as its document. Off, the tag is not
   there at all. */
.${ROOT_CLASS} .xray-tag { display: none; }
.${ROOT_CLASS}[data-xray] [data-action] { position: relative; outline: var(--rule) solid var(--signal); outline-offset: calc(var(--rule) * -1); }
.${ROOT_CLASS}[data-xray] .xray-tag {
  display: block; position: absolute; top: 0; right: 0; z-index: 20; cursor: pointer;
  padding: .15em .5em; background: var(--signal); color: var(--paper);
  font: 700 .72rem/1.3 var(--mono); letter-spacing: .02em;
}
/* nested boxes share corners: each level down puts its tag in the other one */
.${ROOT_CLASS}[data-xray] [data-action] [data-action] > .xray-tag { right: auto; left: 0; }
.${ROOT_CLASS}[data-xray] [data-action] [data-action] [data-action] > .xray-tag { left: auto; right: 0; }
.${ROOT_CLASS}[data-xray] [data-action] [data-action] [data-action] [data-action] > .xray-tag { right: auto; left: 0; }
`;
