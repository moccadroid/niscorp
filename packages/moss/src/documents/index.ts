// ═══════════════════════════════════════════════════════════════
// Documents — how what somebody is looking at reaches them as a page.
//
// The fifth question moss asks of a request, when the answer is a page and not
// the live wire: what a page request is answered with when the server draws
// the first screen itself.
//
// A page request names a path and carries, at most, a cookie. From those two:
// WHICH shell (a page's, if the path leads to one; otherwise the app's), for
// WHOM (the cookie's principal, or nobody), read as it stands (a shell host's
// `snapshot`), drawn to a string by a terminal the app hands in
// (../terminal/react/server and its siblings), and written into the app's own
// index.html beside the snapshot it was drawn from (./document.ts). The
// browser's terminal starts from that snapshot (../client's
// `readDocumentSnapshot`) and adopts the elements already there.
//
// WHAT A DOCUMENT IS HANDED (./config.ts) is a typed object: the three things
// it asks of a server, the template, the request, and the app's drawer. No
// manifest, no runtime and no server.
//
// Moss holds no opinion about the page around the screen: the template is the
// app's file, the kit is the app's, and so is the route this is called from.
//
// The page's <head> is a node in a layout too (nova's `nova:head`, holding the
// elements a head holds), so it is in the snapshot's trees like everything
// else on the screen, and is written into the template's <head> as the screen
// is written into its root.
//
// WHICH PAGE A PATH LEADS TO (./pages.ts) is a router made once from the
// pages' paths, which refuses two pages that could answer one path.
//
// THE SAME DRAW, AS FILES (./export.ts): each path drawn for nobody, for a
// static host.
//
// TWO RULES LIVE HERE, each in one place:
//
//   WHO MAY KEEP A PAGE follows from who asked, and from nothing else
//   (`documentHeaders`). A page drawn for nobody is the same for everybody; a
//   page drawn for somebody is theirs. No page declares which it is.
//
//   NOTHING HERE CAN FAIL A PAGE. Whatever goes wrong — a kit component that
//   throws, a shell that will not build — the answer is the template as it is,
//   and the terminal paints it as it would a page with no drawn screen.
//
// This module imports `protocol`, `identity` and `shells`, and nothing else of
// moss.
// ═══════════════════════════════════════════════════════════════

export type { DocumentConfig, DrawnDocument } from './config';
export { renderDocument } from './document';
export { exportDocuments } from './export';
export type { ExportedDocument } from './export';
export { createPageRouter } from './pages';
