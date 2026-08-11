// THE ICON VOCABULARY — names, not paths.
//
// Rule 2 applies to shapes exactly as it applies to colours: a layout names a
// TOKEN and the kit decides what it looks like. An `icon: 'people'` in an
// action survives a redraw of every glyph in this file; an inline `<svg>` in a
// layout would be a picture welded into a document, unthemeable and
// unreplaceable, and a studio's layout override could ship anything at all.
//
// Before this file the application had NO icons — the only glyphs anywhere
// were a hardcoded `×`, `←`, `‹`, `›`, `—` and three `<span>`s stacked into a
// hamburger. That is most of why every screen read as a wall of grey text: a
// menu of eight words, a table of words, buttons of words.
//
// One geometry, so a row of them looks like a set rather than a collection:
// 24×24 box, stroke only, `currentColor`, round caps and joins, 1.75 weight.
// Nothing here is filled and nothing carries its own colour — an icon is ink,
// and it takes the colour of whatever it sits in.
export const ICON_PATHS: Record<string, string> = {
  // ── navigation ────────────────────────────────────────────
  today: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  checkin: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  person: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  schedule: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  money: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  settings: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4',
  addons: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  signout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  reports: 'M3 3v18h18M7 15v3M12 9v9M17 5v13',
  home: 'M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5',

  // ── objects ───────────────────────────────────────────────
  belt: 'M2 10h20v4H2zM9 10v4M15 10v4',
  plan: 'M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0l-8.2-8.2V3h9.4l8.8 8.8a2 2 0 0 1 0 1.6zM7 7h.01',
  program: 'M4 4h16v16H4zM4 9h16M9 9v11',
  course: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2V5zM8 7h7M8 11h7',
  note: 'M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM14 4v5h5M8 13h8M8 17h5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5 5h14l3 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6l3-7z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6',
  phone: 'M15.5 21A14.5 14.5 0 0 1 3 8.5 3 3 0 0 1 6 5.5h1.5a1 1 0 0 1 1 .9l.6 3a1 1 0 0 1-.5 1L7.4 11.5a12 12 0 0 0 5.1 5.1l1.1-1.2a1 1 0 0 1 1-.5l3 .6a1 1 0 0 1 .9 1V18a3 3 0 0 1-3 3z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  automation: 'M12 3v3M8 6h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 11h.01M15 11h.01M9 15h6',
  building: 'M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15M15 11h4a1 1 0 0 1 1 1v9M8 9h3M8 13h3M8 17h3M2 21h20',
  tag: 'M3 3h8l10 10-8 8L3 11V3zM7.5 7.5h.01',

  // ── verbs ─────────────────────────────────────────────────
  plus: 'M12 5v14M5 12h14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6',
  check: 'M20 6L9 17l-5-5',
  close: 'M18 6L6 18M6 6l12 12',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5z',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  undo: 'M3 8h11a5 5 0 0 1 0 10H8M3 8l4-4M3 8l4 4',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  external: 'M15 3h6v6M21 3l-9 9M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',

  // ── direction ─────────────────────────────────────────────
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronUp: 'M18 15l-6-6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',

  // ── states ────────────────────────────────────────────────
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  warning: 'M10.3 4.3L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  success: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.5l2.5 2.5 4.5-4.5',
  blocked: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  star: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z',
  pause: 'M9 5v14M15 5v14',
  play: 'M6 4l14 8-14 8V4z',
};

export type IconName = keyof typeof ICON_PATHS;
export const ICON_NAMES = Object.keys(ICON_PATHS);
