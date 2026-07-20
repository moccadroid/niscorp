// ═══════════════════════════════════════════════════════════
// The default kit's stylesheet — a self-contained, legible neutral look, so
// the terminal reads the same regardless of the host app's CSS. Layout comes
// from the inline styles the components set (props.ts); this only supplies the
// base scheme, form-control chrome, and table lines. Scoped to
// `.nova-dom-root`, which the target stamps on the mount element.
// ═══════════════════════════════════════════════════════════

export const ROOT_CLASS = 'nova-dom-root';

export const DEFAULT_CSS = `
.${ROOT_CLASS} {
  --dom-line: #d8dae0; --dom-mute: #6b7280; --dom-accent: #2563eb;
  --dom-ink: #14161a; --dom-field: #fff;
  /* Own the scheme: a host that declares color-scheme: dark would otherwise
     make the browser paint every native control (inputs, checkboxes, the
     select arrow, scrollbars) dark, right through this white surface. */
  color-scheme: light;
  background: #fff; color: var(--dom-ink); min-height: 100vh;
  font: 14px/1.5 system-ui, sans-serif;
}
.${ROOT_CLASS} * { box-sizing: border-box; }
.${ROOT_CLASS} [data-canvas="sidebar"] { min-width: 210px; border-right: 1px solid var(--dom-line); padding: 12px; }
.${ROOT_CLASS} [data-canvas="topbar"] { border-bottom: 1px solid var(--dom-line); padding: 10px 14px; }
/* Common shell canvases — the same batteries as sidebar/topbar, so a typical
   app frame lays out sanely with zero host CSS. Aside/modal/devtools honour the
   empty-tree contract (a collapsed canvas sends [] → :empty → no chrome). An
   app with other ids hands its own stylesheet to domTarget. */
.${ROOT_CLASS} [data-canvas="main"] { flex: 1 1 auto; min-width: 0; padding: 16px; overflow: auto; }
.${ROOT_CLASS} [data-canvas="aside"]:not(:empty) { min-width: 240px; border-left: 1px solid var(--dom-line); padding: 12px; overflow: auto; }
.${ROOT_CLASS} [data-canvas="modal"]:not(:empty) { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15, 17, 20, .35); }
/* devtools is a DOCK: float it bottom-right, bounded and scrollable, rather
   than let it sprawl through the document. Sized to content, so the collapsed
   ⚙ pill stays small; the Panel inside supplies the card chrome. */
.${ROOT_CLASS} [data-canvas="devtools"]:not(:empty) { position: fixed; right: 12px; bottom: 12px; z-index: 60; width: max-content; max-width: min(680px, calc(100vw - 24px)); max-height: 62vh; overflow: auto; }
.${ROOT_CLASS} [data-component="Badge"] { display: inline-block; padding: 1px 7px; border: 1px solid var(--dom-line); border-radius: 10px; font-size: 12px; }
.${ROOT_CLASS} [data-component="NavItem"] { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; }
.${ROOT_CLASS} [data-component="NavItem"]:hover { background: #f4f5f7; }
.${ROOT_CLASS} [data-count] { margin-left: auto; color: var(--dom-mute); font-size: 12px; }
.${ROOT_CLASS} button { font: inherit; padding: 5px 11px; border: 1px solid var(--dom-line); border-radius: 6px; background: #fff; color: var(--dom-ink); cursor: pointer; }
.${ROOT_CLASS} button:hover { background: #f4f5f7; }
.${ROOT_CLASS} button[data-variant="primary"] { background: var(--dom-accent); border-color: var(--dom-accent); color: #fff; }
.${ROOT_CLASS} button[data-variant="primary"]:hover { background: #1d4ed8; }
.${ROOT_CLASS} button[data-variant="ghost"] { background: transparent; border-color: transparent; }
.${ROOT_CLASS} button[data-variant="ghost"]:hover { background: #f4f5f7; }
.${ROOT_CLASS} button[data-variant="danger"] { color: #b91c1c; border-color: #f0c8c8; }
.${ROOT_CLASS} button[data-variant="danger"]:hover { background: #fdf2f2; }
.${ROOT_CLASS} button[data-size="sm"] { padding: 3px 8px; font-size: 12px; border-radius: 5px; }
.${ROOT_CLASS} button[data-size="lg"] { padding: 8px 14px; font-size: 15px; }
.${ROOT_CLASS} select { appearance: none; padding-right: 26px; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='none' stroke='%236b7280' stroke-width='1.5' d='M1 1l4 4 4-4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; }
.${ROOT_CLASS} input, .${ROOT_CLASS} textarea, .${ROOT_CLASS} select {
  font: inherit; padding: 5px 8px; border: 1px solid var(--dom-line); border-radius: 6px;
  background: var(--dom-field); color: var(--dom-ink); /* self-contained — never inherit the host's field colors */
}
.${ROOT_CLASS} input::placeholder, .${ROOT_CLASS} textarea::placeholder { color: var(--dom-mute); }
.${ROOT_CLASS} input:focus, .${ROOT_CLASS} textarea:focus, .${ROOT_CLASS} select:focus {
  outline: none; border-color: var(--dom-accent); box-shadow: 0 0 0 3px rgba(37, 99, 235, .15);
}
.${ROOT_CLASS} input[type="checkbox"], .${ROOT_CLASS} input[type="radio"] { accent-color: var(--dom-accent); width: 15px; height: 15px; }
.${ROOT_CLASS} input[type="text"], .${ROOT_CLASS} input:not([type]) { min-width: 180px; }
.${ROOT_CLASS} table { border-collapse: collapse; width: 100%; }
.${ROOT_CLASS} th, .${ROOT_CLASS} td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--dom-line); font-size: 14px; }
.${ROOT_CLASS} th { color: var(--dom-mute); font-weight: 600; font-size: 12px; }
.${ROOT_CLASS} tr[data-row] { cursor: pointer; }
.${ROOT_CLASS} tr[data-row]:hover td { background: #f4f5f7; }
.${ROOT_CLASS} [data-nova-error] { color: #b91c1c; font-size: 12px; }
.${ROOT_CLASS} [data-panel] { border: 1px solid var(--dom-line); border-radius: 10px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.06); padding: 12px; }
.${ROOT_CLASS} [data-panel-title] { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; margin-bottom: 8px; }
.${ROOT_CLASS} [data-panel-title] button { padding: 0 4px; border: 0; background: transparent; color: var(--dom-mute); }
.${ROOT_CLASS} [data-panel-title] button:last-child { margin-left: auto; }
.${ROOT_CLASS} [data-json] { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.${ROOT_CLASS} [data-json-body] { padding-left: 13px; border-left: 1px solid var(--dom-line); margin-left: 3px; }
.${ROOT_CLASS} [data-json] summary { cursor: pointer; color: var(--dom-mute); }
.${ROOT_CLASS} [data-json-leaf] { white-space: pre-wrap; word-break: break-word; }
`;
