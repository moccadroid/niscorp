// ═══════════════════════════════════════════════════════════
// @niscorp/nova/document — a screen's head, said in an HTML document.
//
// Nova's core is surface-blind: a head is a node in a layout (`nova:head`) and
// `headOf` reads it off a render tree. This is the one surface that has a
// <head> to say it in. `placeHead` writes it into a document that is being
// drawn to a string — what `nisc build` and moss's `renderDocument` call — and
// `createTitleKeeper` keeps the tab's title on it once the page is live.
// ═══════════════════════════════════════════════════════════

// The reader and the name, here as well as at the root: a terminal that only
// keeps a tab's title needs these and none of the rest of nova.
export { HEAD_NAME } from '../layout/head';
export type { Head } from '../layout/head';
export { headOf, isHeadNode } from '../shell/head';
export type { ScreenHead } from '../shell/head';
export { placeHead } from './place-head';
export type { HeadPlace } from './place-head';
export { createTitleKeeper } from './title';
export type { TitleKeeper } from './title';
