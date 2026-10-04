// ═══════════════════════════════════════════════════════════
// @niscorp/nova/document — a screen's head, in an HTML document.
//
// Nova's core is surface-blind: a head is a node in a layout (`nova:head`,
// holding `nova:title`, `nova:meta`, `nova:link`, `nova:script`) and `headOf`
// reads its elements off a render tree. This is the one surface that has a
// <head> to write them in. `placeHead` writes them into a document that is
// being drawn to a string — what `nisc build` and moss's `renderDocument` call
// — and `createHeadKeeper` keeps the page's head on them once the page is live.
//
// The reader and the names are here as well as at the root: a terminal that
// only keeps a page's head needs these and none of the rest of nova.
// ═══════════════════════════════════════════════════════════

export { HEAD_NAME, HEAD_TITLE_NAME, HEAD_META_NAME, HEAD_LINK_NAME, HEAD_SCRIPT_NAME, HEAD_NAMES, headKeyOf } from '../layout/head';
export type { HeadElement } from '../layout/head';
export { headOf, isHeadNode } from '../shell/head';
export type { ScreenHead } from '../shell/head';
export { placeHead, HEAD_MARK, OWN_MARK } from './place-head';
export type { HeadPlace } from './place-head';
export { createHeadKeeper } from './head-keeper';
export type { HeadKeeper } from './head-keeper';
