export const ROOT_CLASS = 'lyceum';

export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Space+Grotesk:wght@400;500&family=Space+Mono:wght@400;700&display=swap';

// The stage is the page with a strip. A screen made of regions is any other
// page whose main sheet's cells hold canvases (the controller; the phone's
// list is drawn the same at any width); a panel is one of those regions, the
// head bar left out.
const STAGE = `.${ROOT_CLASS} .page:has(> [data-canvas="strip"]:not(:empty))`;
const REGIONS = `.${ROOT_CLASS} .page:not(:has(> [data-canvas="strip"]:not(:empty))) > [data-canvas="main"] > * > .sheet:has(> .cell > [data-canvas]):not(:has(> .cell > [data-canvas="body"]))`;
const PANEL = `${REGIONS} > .cell > [data-canvas]:not([data-canvas="head"])`;
// A form: a screen off the stage whose sheet holds a field (the door, the
// speaker's sign-in).
const FORM = `.${ROOT_CLASS} .page:not(:has(> [data-canvas="strip"]:not(:empty))) > [data-canvas="main"] > * > .sheet:has(> .field)`;
// An action standing alone: in a panel, on the phone's list, a form, or what
// is opened over the screen.
const DIALOG = `:is(${PANEL} > * > .sheet, .${ROOT_CLASS} .cell > [data-canvas="body"] > * > .sheet, ${FORM}, .${ROOT_CLASS} .page > [data-canvas="overlay"] > * > .sheet > .cell > .sheet)`;

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
/* the stage: a slide is designed for a 16:9 screen, and the rem is that
   screen's — 2.5vh and 1.4vw are the same 27px on 1920×1080, and the two
   agree on every 16:9 screen, so a slide holds the same lines and the same
   characters a line on all of them. A screen of another ratio takes the
   smaller: the slide is drawn as on the wide screen, only scaled, and the
   rest of the screen goes to the slide's last row — it never re-wraps. */
html:has(.page > [data-canvas="strip"]:not(:empty)) { font-size: clamp(14px, min(2.5vh, 1.4vw), 28px); }
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
   zero everywhere else). */
.${ROOT_CLASS} .page { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); background: var(--paper); }
/* the projector has no controls: no pointer on it either */
.${ROOT_CLASS} .page:has(> [data-canvas="strip"]:not(:empty)) { cursor: none; }
.${ROOT_CLASS} .page > [data-canvas] { display: flex; flex-direction: column; min-height: 0; }
/* the strip keeps its height: a slide whose content wants more than the screen
   clips inside its cells, and never shortens the line above it */
.${ROOT_CLASS} .page > [data-canvas="strip"] { flex-shrink: 0; }
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

/* THE STAGE, as nisc.dev sets a demo: the slide stands on paper, set in from
   the screen's edge, casting the hard shadow; the strip runs edge to edge
   above it, paper with a rule under it, and only the count is in colour. */
${STAGE} > [data-canvas="main"] { padding: .8rem 1.3rem 1.3rem 1rem; }
${STAGE} > [data-canvas="main"]:not(:empty) > * > .sheet { border-top: var(--rule) solid var(--ink); box-shadow: .45rem .45rem 0 var(--ink); }
.${ROOT_CLASS} .page > [data-canvas="strip"] > * > .sheet { border-width: 0 0 var(--rule); }
.${ROOT_CLASS} .page > [data-canvas="strip"] .cell[data-ink="highlight"] { --bg: var(--paper); }

/* AN ACTION STANDING ALONE is nisc.dev's dialog: its first label is a header
   bar across it, below that things stand on paper with room between, and a
   button is a chip, framed and casting the shadow. */
${DIALOG} { background: var(--paper); gap: .75rem; padding: .9rem; }
${DIALOG}:has(> .cell:first-child > .label:only-child) { padding-top: 0; }
${DIALOG} > .cell:first-child:has(> .label:only-child) { margin: 0 -.9rem; padding: .6rem .9rem; }
${DIALOG} > .cell:first-child:not([data-ink]):has(> .label:only-child) { --bg: var(--ink); --fg: var(--paper); }
${DIALOG} > .cell:not([data-ink]):not([data-mark]):not(:first-child) { padding: 0; }
${DIALOG} > .cell > .sheet:has(> *) { border: var(--rule) solid var(--ink); }
${DIALOG} > .action { border: var(--rule) solid var(--ink); box-shadow: 4px 4px 0 var(--ink); }
${DIALOG} > .action:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--ink); }

/* A FORM on a screen wider than a phone stands as a card in the middle of it. */
@media (min-width: 641px) {
  ${FORM} { flex: 0 1 auto; width: min(100% - 3rem, 34rem); margin: auto; border: var(--rule) solid var(--ink); box-shadow: 8px 8px 0 var(--ink); }
}

/* ON A PHONE the screen's edge is the frame: the top sheet draws none, and a
   label it opens with is the header bar. */
@media (max-width: 640px) {
  .${ROOT_CLASS} .page:not(:has(> [data-canvas="strip"]:not(:empty))) > [data-canvas="main"] > * > .sheet { border-width: 0; }
  .${ROOT_CLASS} .page:not(:has(> [data-canvas="strip"]:not(:empty))) > [data-canvas="main"] > * > .sheet > .cell:first-child:not([data-ink]):has(> .label:only-child) { --bg: var(--ink); --fg: var(--paper); }
}

/* A SCREEN MADE OF REGIONS, wider than a phone: each region is a panel on
   paper, framed and casting the shadow, with room between — not a cell of one
   grid. A region with nothing in it leaves its place; while nothing is
   attached, the slide's tools take that place too. */
@media (min-width: 641px) {
  ${REGIONS} { gap: 1.1rem; background: var(--paper); border: 0; padding: 1rem 1.4rem 1.4rem 1rem; }
  ${REGIONS} > .cell { border: var(--rule) solid var(--ink); box-shadow: 6px 6px 0 var(--ink); }
  ${REGIONS} > .cell:has(> [data-canvas]:empty) { display: none; }
  ${REGIONS}:has(> .cell > [data-canvas="attached"]:empty) > .cell:has(> [data-canvas="tools"]) { grid-row: tools-start / attached-end !important; }
  ${PANEL} > * > .sheet, ${PANEL} > .sheet { border: 0; }
  ${PANEL} > .sheet { background: var(--paper); padding: .9rem; }
  ${PANEL} > * + * > .sheet { border-top: var(--rule) solid var(--ink); }
  ${PANEL} > *:last-child { min-height: auto; }
  /* a panel shares the screen with three others: its dialog sits closer */
  ${PANEL} > * > .sheet { gap: .5rem; padding: .6rem; }
  ${PANEL} > * > .sheet > .cell:first-child:has(> .label:only-child) { margin: 0 -.6rem; padding: .45rem .6rem; }
  ${PANEL} > * > .sheet > .action { min-height: 2.75rem; padding-block: .55rem; }
  .${ROOT_CLASS} [data-canvas="notes"] .text { font-size: 1.3rem; line-height: 1.45; }
  .${ROOT_CLASS} [data-canvas="head"] .headline[data-level="name"] { font-size: 1.6rem; }
  .${ROOT_CLASS} [data-canvas="controls"] .action { min-height: 4.5rem; font-size: 1.05rem; }
}

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
/* an empty list canvas holds its sheet directly: that one stays a grid */
.${ROOT_CLASS} .cell > [data-canvas] > * { flex: 0 0 auto; }
.${ROOT_CLASS} .cell > [data-canvas] > :not(.sheet) { display: flex; flex-direction: column; }
.${ROOT_CLASS} .cell > [data-canvas] > *:last-child { flex: 1 1 auto; min-height: 0; }
/* a sheet that fills takes the region; any other is as tall as it is, with its
   own rule under it and the region's paper below */
.${ROOT_CLASS} .cell > [data-canvas] > * > .sheet { border: 0; flex: 0 0 auto; border-bottom: var(--rule) solid var(--ink); }
.${ROOT_CLASS} .cell > [data-canvas] > * > .sheet[data-size="fill"] { flex: 1 1 auto; border-bottom: 0; }
/* THE PHONE'S LIST (member/phone.action.ts): every action on it is as tall as
   it is, one under another, each with its rule under it — nothing stretches to
   fill what is left; the list scrolls instead. */
.${ROOT_CLASS} .cell > [data-canvas="body"] { gap: 14px; padding: 14px 10px 24px; }
.${ROOT_CLASS} .cell > [data-canvas="body"] > *,
.${ROOT_CLASS} .cell > [data-canvas="body"] > *:last-child { flex: 0 0 auto; }
/* each action its own block: framed all round, space between, so two never
   read as one */
.${ROOT_CLASS} .cell > [data-canvas="body"] > * > .sheet,
.${ROOT_CLASS} .cell > [data-canvas="body"] > * > .sheet[data-size="fill"] { flex: 0 0 auto; border: var(--rule) solid var(--ink); box-shadow: 6px 6px 0 var(--ink); }

/* the phone's tabs: side by side, equally wide, one rule between them — not
   stacked like the other list regions */
.${ROOT_CLASS} .cell > [data-canvas="tabs"] { flex-direction: row; gap: var(--rule); background: var(--ink); overflow: hidden; }
.${ROOT_CLASS} .cell > [data-canvas="tabs"] > *,
.${ROOT_CLASS} .cell > [data-canvas="tabs"] > *:last-child { flex: 1 1 0; min-width: 0; }

/* ── cell: a place in the grid, and its ink ── */
/* defaults first, so an ink always out-ranks them */
.${ROOT_CLASS} :where(.cell, .bar > span, .action, .flow-lane, .stats > div, .pipeline-step, .pipeline-legend > span) { --bg: var(--paper); --fg: var(--ink); }
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
/* Centred is for words. Code reads left to right, and a table spans its cell. */
.${ROOT_CLASS} .cell[data-align="center"] .code { text-align: left; }
.${ROOT_CLASS} .cell[data-align="center"] .rows { align-self: stretch; text-align: left; }
.${ROOT_CLASS} .cell[data-align="between"] { justify-content: space-between; }
/* Middle: vertically centred, read from the left — for anything that is not one word. */
.${ROOT_CLASS} .cell[data-align="middle"] { justify-content: center; }
.${ROOT_CLASS} .cell[data-pad="none"] { padding: 0; }
.${ROOT_CLASS} .cell[data-scroll="y"] { overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
/* held at its end: a reversed column opens scrolled to its last line, and
   stays there as lines arrive — its end is where it scrolls FROM. The cell is
   kept across updates (nova's DOM adapter patches the page), so somebody who
   scrolled back is left where they scrolled to. */
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
/* off the stage a label is a caption, in nisc.dev's voice */
.${ROOT_CLASS} .page:not(:has(> [data-canvas="strip"]:not(:empty))) .label { font: 400 .8rem/1.3 var(--mono); letter-spacing: .06em; }
.${ROOT_CLASS} .headline { font-family: var(--display); font-weight: 900; text-transform: uppercase; line-height: 1.04; overflow-wrap: normal; word-break: normal; hyphens: none; }
.${ROOT_CLASS} .headline[data-level="display"] { font-size: clamp(2.2rem, calc(5.4 * var(--cq)), 4.8rem); }
.${ROOT_CLASS} .headline[data-level="title"]   { font-size: clamp(1.6rem, calc(3 * var(--cq)), 3.2rem); }
.${ROOT_CLASS} .headline[data-level="name"]    { font-size: clamp(1.25rem, calc(1.9 * var(--cq)), 44px); line-height: 1.05; }
.${ROOT_CLASS} .text { font-size: clamp(1.06rem, calc(1.75 * var(--cq)), 2.2rem); line-height: 1.35; }
.${ROOT_CLASS} .text[data-tone="muted"] { opacity: 1; color: color-mix(in srgb, var(--fg) 55%, var(--bg)); }
.${ROOT_CLASS} .figure { display: flex; flex-direction: column; gap: .3em; }
.${ROOT_CLASS} .figure > .value { font: 900 clamp(2rem, calc(5 * var(--cq)), 4.4rem)/.85 var(--display); }
/* a countdown reads as a clock: figures that do not jump as they change */
.${ROOT_CLASS} .countdown > .value { font-variant-numeric: tabular-nums; }

/* ── code: a cell of mono, the lines that matter highlighted ── */
.${ROOT_CLASS} .code { font: 400 clamp(.8rem, calc(1.6 * var(--cq)), 1.5rem)/1.35 var(--mono); white-space: pre; overflow: hidden; }
.${ROOT_CLASS} .code > span { display: block; }
/* code in a cell that scrolls (a phone reading a document, not a slide showing
   one) wraps its long lines instead of cutting them off */
.${ROOT_CLASS} .cell[data-scroll] .code { white-space: pre-wrap; overflow-wrap: anywhere; }
/* code in ink is nisc.dev's pane: near-black, warm white, captioned in mono */
.${ROOT_CLASS} .cell[data-ink="ink"]:has(> .code) { --bg: #111; --fg: #e9e6dc; }
.${ROOT_CLASS} .cell:has(> .code) > .label { font-family: var(--mono); font-weight: 400; letter-spacing: .06em; }
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
  --well: #f0f0f0;
  border: 0; outline: 0; width: 100%; color: var(--ink); caret-color: var(--alert);
  /* iOS paints a field's text with its own fill colour (white in dark mode)
     and its own chrome unless told otherwise: pin both to the ink. */
  -webkit-text-fill-color: var(--ink); -webkit-appearance: none; appearance: none; border-radius: 0; opacity: 1; color-scheme: light;
  padding: var(--pad-y) var(--pad-x);
  background:
    linear-gradient(var(--ink), var(--ink)) no-repeat left var(--pad-x) bottom calc(var(--pad-y) * .55) / calc(100% - var(--pad-x) * 2) var(--rule),
    var(--well);
  /* never under 16px: a phone zooms the page into a smaller field */
  font: 500 clamp(1.1rem, calc(2.2 * var(--cq)), 2.4rem)/1.2 var(--prose);
}
.${ROOT_CLASS} .field::placeholder { color: #666666; -webkit-text-fill-color: #666666; opacity: 1; }
.${ROOT_CLASS} .field:focus { --well: var(--highlight); }

/* ── check: a box that is ticked or not, its words beside it; a ticked one reads as done ── */
.${ROOT_CLASS} .check {
  display: flex; align-items: center; gap: .7em; cursor: pointer; color: var(--ink);
  font: 500 clamp(1rem, calc(1.6 * var(--cq)), 1.8rem)/1.2 var(--prose);
  padding-block: .1em;
}
.${ROOT_CLASS} .check > input {
  -webkit-appearance: none; appearance: none; margin: 0; flex: none; cursor: pointer; font: inherit;
  width: 1.1em; height: 1.1em; border: var(--rule) solid var(--ink); background: var(--bg);
  display: grid; place-content: center;
}
.${ROOT_CLASS} .check > input:checked { background: var(--ink); }
.${ROOT_CLASS} .check > input:checked::after { content: ''; width: .55em; height: .3em; border: solid var(--bg); border-width: 0 0 .14em .14em; transform: translateY(-.08em) rotate(-45deg); }
.${ROOT_CLASS} .check:has(> input:checked) > span { text-decoration: line-through; color: #666666; }

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
.${ROOT_CLASS} .columns-fill { position: relative; width: 100%; flex: none; }
.${ROOT_CLASS} .columns-fill:not([data-mark]) { background: var(--bg); }
/* A marked bar is what is counted apart: paper, its pattern in ink, an edge so it is still a bar. */
.${ROOT_CLASS} .columns-fill[data-mark] { --bg: var(--paper); --fg: var(--ink); box-shadow: inset 0 0 0 var(--rule) var(--ink); }
.${ROOT_CLASS} .columns-fill[data-mark] > .columns-value { background: none; padding: 0 0 .12em; width: auto; }

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

/* ── menu: three bars that open a list of things to press ── */
.${ROOT_CLASS} .menu { position: relative; background: var(--paper); display: flex; }
.${ROOT_CLASS} .menu-icon {
  list-style: none; cursor: pointer; flex: 1 1 auto; min-width: max(3.25rem, 48px); min-height: max(2.5rem, 40px);
  background:
    linear-gradient(var(--ink), var(--ink)) center calc(50% - 7px) / 22px 3px no-repeat,
    linear-gradient(var(--ink), var(--ink)) center 50% / 22px 3px no-repeat,
    linear-gradient(var(--ink), var(--ink)) center calc(50% + 7px) / 22px 3px no-repeat,
    var(--paper);
}
.${ROOT_CLASS} .menu-icon::-webkit-details-marker { display: none; }
.${ROOT_CLASS} .menu[open] > .menu-icon { background-color: var(--highlight); }
/* an open menu hangs below its own cell, over what is under it: the cell and the
   canvas that hold it stop clipping while it is open — the wipe a cell arrives
   with too, which leaves its clip on the cell (above, "a slide arriving") —
   and the cell stands over its neighbours */
.${ROOT_CLASS} .cell:has(.menu[open]), .${ROOT_CLASS} .cell:has(.menu[open]) > [data-canvas] { overflow: visible; }
.${ROOT_CLASS} .cell:has(.menu[open]) { position: relative; z-index: 20; animation: none !important; }
.${ROOT_CLASS} .menu-items {
  position: absolute; top: 100%; right: 0; z-index: 20; min-width: 14rem;
  display: flex; flex-direction: column; gap: var(--rule); background: var(--ink); border: var(--rule) solid var(--ink);
}

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
/* a button that stands in a cell rather than being one: nisc.dev's press */
.${ROOT_CLASS} .cell > .action { border: var(--rule) solid var(--ink); box-shadow: .3rem .3rem 0 var(--ink); }
.${ROOT_CLASS} .cell > .action:active { transform: translate(3px, 3px); box-shadow: 2px 2px 0 var(--ink); }
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

/* THE TERMINAL LOOK: the screen as Nova's line terminal draws it, and a line
   to type a number into. */
.${ROOT_CLASS} .terminal-page { min-height: 100%; display: flex; flex-direction: column; background: #111; color: #e9e6dc; padding: 1rem; gap: .8rem; }
.${ROOT_CLASS} .terminal { flex: 1 1 auto; margin: 0; font: 400 clamp(.9rem, calc(1.6 * var(--cq)), 1.6rem)/1.45 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.${ROOT_CLASS} .terminal-page[data-projector] .terminal { font-size: 1.5vw; }
.${ROOT_CLASS} .terminal-line { font: 400 1rem/1.4 var(--mono); background: #000; color: #e9e6dc; border: 1px solid #e9e6dc; padding: .6em .8em; }

/* THE X-RAY: the screen as it is, with every action on it outlined and its id
   in the corner — nested the way the screen is composed. The tag is the one
   thing to tap: it opens that action as its document. Off, the tag is not
   there at all. A cell marked xray shows what is inside it the same way. */
.${ROOT_CLASS} .xray-tag { display: none; }

/* Work under way: stripes in a highlighted cell are a bar that moves. */
.${ROOT_CLASS} .cell[data-ink="highlight"] .cell[data-mark="stripes"] { min-height: 18px; padding: 0; background-size: 19.8px 19.8px; animation: working 0.8s linear infinite; }
@keyframes working { to { background-position: 19.8px 0; } }
:is(.${ROOT_CLASS}[data-xray], .${ROOT_CLASS} .cell[data-xray]) [data-action] { position: relative; outline: var(--rule) solid var(--signal); outline-offset: calc(var(--rule) * -1); }
:is(.${ROOT_CLASS}[data-xray], .${ROOT_CLASS} .cell[data-xray]) .xray-tag {
  display: block; position: absolute; top: 0; right: 0; z-index: 1; cursor: pointer;
  /* a finger's worth: this is tapped on a phone */
  min-height: 36px; padding: .5em .8em; background: var(--signal); color: var(--paper);
  font: 700 1rem/1.2 var(--mono); letter-spacing: .01em;
}
/* nested boxes share corners: each level down puts its tag in the other one */
:is(.${ROOT_CLASS}[data-xray], .${ROOT_CLASS} .cell[data-xray]) [data-action] [data-action] > .xray-tag { right: auto; left: 0; }
:is(.${ROOT_CLASS}[data-xray], .${ROOT_CLASS} .cell[data-xray]) [data-action] [data-action] [data-action] > .xray-tag { left: auto; right: 0; }
:is(.${ROOT_CLASS}[data-xray], .${ROOT_CLASS} .cell[data-xray]) [data-action] [data-action] [data-action] [data-action] > .xray-tag { right: auto; left: 0; }
/* over the screen, the corner at the top is the sheet's Close: the tag goes to the bottom */
:is(.${ROOT_CLASS}[data-xray], .${ROOT_CLASS} .cell[data-xray]) [data-canvas="overlay"] [data-action] > .xray-tag { top: auto; bottom: 0; }

/* ═══ THE READING GRAMMAR — nisc.dev's, on the stage ═══
   A sheet at the page scale is a slide that is READ, not glanced at: every
   size inside is fixed in rem (the rem follows the screen, above) and every
   run of words has a measure, so nothing grows with its neighbour and a
   headline never takes the sheet. Code lives in an EXHIBIT — a captioned pane,
   set in colour — and never in a cell beside prose. */
/* the dense scale is the reading scale drawn a size down: everything on the
   sheet together, so it keeps its proportions and holds a third more */
.${ROOT_CLASS} .sheet[data-scale="dense"] { zoom: .76; }
.${ROOT_CLASS} .sheet[data-scale] .cell { padding: 1.2rem 1.5rem; gap: .8rem; }
.${ROOT_CLASS} .sheet[data-scale] .label { font-size: .78rem; }
.${ROOT_CLASS} .sheet[data-scale] .headline { letter-spacing: -.015em; }
/* a slide's claim is a sentence, set at nisc.dev's heading size, not its
   hero's; it runs the width of its cell — two lines at most on a 16:9 screen */
.${ROOT_CLASS} .sheet[data-scale] .headline[data-level="display"] { font-size: 2.4rem; line-height: .98; }
.${ROOT_CLASS} .sheet[data-scale] .headline[data-level="title"] { font-size: 1.8rem; line-height: 1.02; max-width: 20em; }
.${ROOT_CLASS} .sheet[data-scale] .headline[data-level="name"] { font-size: 1.25rem; line-height: 1.15; }
.${ROOT_CLASS} .sheet[data-scale] .text { font-size: 1.1rem; line-height: 1.4; max-width: 32em; }
.${ROOT_CLASS} .sheet[data-scale] .text[data-size="lede"] { font-size: 1.3rem; line-height: 1.4; max-width: 29em; }
.${ROOT_CLASS} .sheet[data-scale] .text[data-size="small"] { font-size: .95rem; line-height: 1.4; }
.${ROOT_CLASS} .sheet[data-scale] .text[data-size="fine"] { font: 400 .78rem/1.4 var(--mono); max-width: none; }
.${ROOT_CLASS} .sheet[data-scale] .figure > .value { font-size: 3rem; }
.${ROOT_CLASS} .sheet[data-scale] .code { font-size: .85rem; }
.${ROOT_CLASS} .sheet[data-scale] .rows > div > span { font-size: 1rem; }
.${ROOT_CLASS} .sheet[data-scale] .rows[data-head] > div:first-child > span { font-size: .72rem; }
/* a stack or a pair inside a cell takes what the cell leaves it */
.${ROOT_CLASS} .cell > .stack, .${ROOT_CLASS} .cell > .pair { flex: 1 1 auto; min-height: 0; }

/* ── exhibit: one document, set out to be read — nisc.dev's, to the letter ──
   On paper: black on white behind a 3px rule, no shadow, no colour; the lines
   wrap. In ink: the pane is near-black, the caption is a tab sitting on it,
   and the document is set in colour — keywords, strings, numbers, comments,
   nothing else. */
.${ROOT_CLASS} .exhibit { margin: 0; display: grid; gap: .45rem; align-content: start; min-width: 0; max-width: 100%; }
.${ROOT_CLASS} .exhibit > figcaption { font: 400 .76rem/1.4 var(--mono); letter-spacing: .06em; text-transform: uppercase; }
.${ROOT_CLASS} .exhibit > pre {
  margin: 0; min-width: 0; padding: .95rem 1.1rem; border: var(--rule) solid var(--ink); background: var(--paper); color: var(--ink);
  font: 400 .9rem/1.6 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere;
}
.${ROOT_CLASS} .exhibit > pre > span { display: block; }
/* fit: the whole document shows — the type is set small enough for its line count and its longest line */
.${ROOT_CLASS} .exhibit[data-fit] { flex: 1 1 auto; min-height: 0; align-self: stretch; container-type: size; grid-template-rows: auto minmax(0, 1fr); }
.${ROOT_CLASS} .exhibit[data-fit] > pre { white-space: pre; overflow: hidden; font-size: min(.9rem, calc((100cqh - 3.4rem) / (var(--lines) * 1.6)), calc((100cqw - 2.6rem) / (var(--cols) * .61))); }
.${ROOT_CLASS} [data-ink="ink"] .exhibit > pre, .${ROOT_CLASS} [data-ink="signal"] .exhibit > pre { border-color: var(--paper); }
.${ROOT_CLASS} .exhibit[data-tone="ink"] { gap: 0; }
.${ROOT_CLASS} .exhibit[data-tone="ink"] > figcaption { justify-self: start; background: #111; color: #e9e6dc; border: var(--rule) solid var(--ink); border-bottom: 0; padding: .45rem .7rem .35rem; }
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre { background: #111; color: #e9e6dc; }
/* a document set in colour: its names are white, as on nisc.dev (its exhibit-ink pre code rule) */
.${ROOT_CLASS} .exhibit[data-tone="ink"][data-lang] > pre { color: #fff; }
.${ROOT_CLASS} [data-ink="ink"] .exhibit[data-tone="ink"] > figcaption, .${ROOT_CLASS} [data-ink="signal"] .exhibit[data-tone="ink"] > figcaption { border-color: var(--paper); }
/* the lines that matter */
.${ROOT_CLASS} .exhibit > pre > span[data-marked] { background: var(--highlight); color: var(--ink); margin: 0 -.5em; padding: 0 .5em; }
.${ROOT_CLASS} .exhibit > pre > span[data-marked] * { color: inherit; }
/* a flagged exhibit: its caption is a tab wearing the ink — orange a draft that failed, green one that ran */
.${ROOT_CLASS} .exhibit[data-flag] { gap: 0; }
.${ROOT_CLASS} .exhibit[data-flag] > figcaption { justify-self: start; padding: .45rem .7rem .35rem; border: var(--rule) solid var(--ink); border-bottom: 0; background: var(--flag-bg); color: var(--flag-fg); }
.${ROOT_CLASS} .exhibit[data-flag="alert"] { --flag-bg: var(--alert); --flag-fg: var(--ink); }
.${ROOT_CLASS} .exhibit[data-flag="live"] { --flag-bg: var(--live); --flag-fg: var(--ink); }
.${ROOT_CLASS} .exhibit[data-flag="signal"] { --flag-bg: var(--signal); --flag-fg: var(--paper); }
.${ROOT_CLASS} .exhibit[data-flag="highlight"] { --flag-bg: var(--highlight); --flag-fg: var(--ink); }
.${ROOT_CLASS} .exhibit[data-flag="ink"] { --flag-bg: var(--ink); --flag-fg: var(--paper); }
.${ROOT_CLASS} .exhibit[data-flag="paper"] { --flag-bg: var(--paper); --flag-fg: var(--ink); }
/* code in colour, in ink only (nisc.dev's palette) */
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-comment { color: #8a8780; }
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-keyword { color: #8fa8ff; }
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-string { color: #5fe08a; }
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-title, .${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-built_in { color: var(--highlight); }
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-number, .${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-literal { color: #ff9b70; }
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-attr, .${ROOT_CLASS} .exhibit[data-tone="ink"] > pre .hljs-property { color: #fff; }
/* a marked line reads in its own ink, whatever the colouring under it */
.${ROOT_CLASS} .exhibit[data-tone="ink"] > pre > span[data-marked] * { color: inherit; }

/* ── pair: two things side by side; one under the other where there is no room ── */
.${ROOT_CLASS} .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1.4rem; align-items: start; min-width: 0; }
.${ROOT_CLASS} .pair[data-split="narrow-wide"] { grid-template-columns: 1fr 1.25fr; }
.${ROOT_CLASS} .pair[data-split="wide-narrow"] { grid-template-columns: 1.25fr 1fr; }
.${ROOT_CLASS} .pair > * { min-width: 0; }
@media (max-width: 760px) { .${ROOT_CLASS} .pair { grid-template-columns: 1fr; } }

/* ── stack: things one under another ── */
.${ROOT_CLASS} .stack { display: grid; gap: 1.2rem; align-content: start; min-width: 0; }
.${ROOT_CLASS} .stack[data-gap="tight"] { gap: .6rem; }
.${ROOT_CLASS} .stack[data-scroll="y"] { overflow-y: auto; min-height: 0; overscroll-behavior: contain; padding: 1.3rem 1.5rem; }
.${ROOT_CLASS} .stack > * { min-width: 0; }

/* ── stats: a row of figures, each with what it counts ── */
.${ROOT_CLASS} .stats { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: var(--rule); background: var(--ink); border: var(--rule) solid var(--ink); }
.${ROOT_CLASS} .stats > div { background: var(--bg); color: var(--fg); padding: .9rem 1rem; display: grid; gap: .35rem; align-content: start; }
.${ROOT_CLASS} .stats b { font: 900 2.4rem/1 var(--display); font-variant-numeric: tabular-nums; }
.${ROOT_CLASS} .stats span { font: 700 .7rem/1.2 var(--display); letter-spacing: .06em; text-transform: uppercase; }

/* ── pipeline: a line of steps that always run, and one detour under it ──
   A step is a box wearing its ink; a link is a rule with a head; what did not
   happen stays where it is, faded — the picture is the same every time and
   only what is lit changes. */
.${ROOT_CLASS} .pipeline { display: grid; grid-template-rows: auto 1.6rem auto; align-items: stretch; min-width: 0; }
.${ROOT_CLASS} .pipeline-step { background: var(--bg); color: var(--fg); border: var(--rule) solid var(--ink); padding: .5rem .8rem .6rem; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .25rem .6rem; align-content: start; min-width: 0; }
.${ROOT_CLASS} .pipeline-step > b { font: 900 .82rem/1.1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
/* a value is a line; a longer one — somebody's question — takes a second and stops there */
/* how long the step took: in its corner, in figures that do not jump as they change */
.${ROOT_CLASS} .pipeline-step > i { font: 700 .8rem/1.1 var(--mono); font-style: normal; font-variant-numeric: tabular-nums; white-space: nowrap; align-self: center; }
.${ROOT_CLASS} .pipeline-step > span { grid-column: 1 / -1; font: 400 .8rem/1.3 var(--mono); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.${ROOT_CLASS} .pipeline [data-off] { opacity: .22; }
.${ROOT_CLASS} .pipeline-step[data-off] { background: var(--paper); color: var(--ink); }
/* a link: a rule from one step to the next, its head at the far end */
.${ROOT_CLASS} .pipeline-link { align-self: center; position: relative; height: var(--rule); background: var(--ink); min-width: 1.6rem; margin-right: .5rem; }
.${ROOT_CLASS} .pipeline-link::after { content: ''; position: absolute; right: -.5rem; top: 50%; translate: 0 -50%; border: .38rem solid transparent; border-left-color: var(--ink); border-right: 0; }
.${ROOT_CLASS} .pipeline-link > span { position: absolute; left: 0; right: 0; bottom: .35rem; text-align: center; font: 400 .7rem/1 var(--mono); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
/* the way down into the detour and the way back up: rules with heads, each said beside it */
.${ROOT_CLASS} .pipeline-enter, .${ROOT_CLASS} .pipeline-leave { position: relative; align-self: stretch; margin-left: 1.6rem; border-left: var(--rule) solid var(--ink); }
.${ROOT_CLASS} .pipeline-enter { margin-bottom: .5rem; }
.${ROOT_CLASS} .pipeline-leave { margin-top: .5rem; }
.${ROOT_CLASS} .pipeline-enter::after { content: ''; position: absolute; left: calc(var(--rule) / -2); bottom: -.5rem; translate: -50% 0; border: .38rem solid transparent; border-top-color: var(--ink); border-bottom: 0; }
.${ROOT_CLASS} .pipeline-leave::after { content: ''; position: absolute; left: calc(var(--rule) / -2); top: -.5rem; translate: -50% 0; border: .38rem solid transparent; border-bottom-color: var(--ink); border-top: 0; }
.${ROOT_CLASS} .pipeline-enter > span, .${ROOT_CLASS} .pipeline-leave > span { position: absolute; left: .6rem; top: 50%; translate: 0 -50%; font: 400 .7rem/1 var(--mono); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
/* the detour: its steps in a dashed box, said along its top */
.${ROOT_CLASS} .pipeline-detour { border: 2px dashed var(--ink); padding: .45rem .7rem .7rem; display: grid; gap: .4rem; min-width: 0; }
.${ROOT_CLASS} .pipeline-detour[data-off] { opacity: 1; border-color: color-mix(in srgb, var(--ink) 22%, transparent); }
.${ROOT_CLASS} .pipeline-detour[data-off] > .pipeline-said { opacity: .22; }
.${ROOT_CLASS} .pipeline-said { font: 400 .7rem/1.2 var(--mono); letter-spacing: .04em; text-transform: uppercase; }
.${ROOT_CLASS} .pipeline-inner { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); grid-template-columns: minmax(0, 1fr) 3rem minmax(0, 1fr); align-items: center; }
.${ROOT_CLASS} .pipeline-legend { align-self: center; justify-self: end; display: grid; gap: .45rem; padding-left: 1rem; }
.${ROOT_CLASS} .pipeline-legend > span { display: flex; align-items: center; gap: .5rem; font: 400 .7rem/1 var(--mono); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
.${ROOT_CLASS} .pipeline-legend > span::before { content: ''; width: .9rem; height: .9rem; flex: none; background: var(--bg); border: 2px solid var(--ink); }
`;
