import type { LayoutNode } from '@niscorp/nova';

// THE FRAME — the canvas arrangement, served to terminals verbatim. A tree of
// CanvasSlot markers and nothing else: the terminal owns pixels, this owns
// where the canvases sit relative to each other.
//
// ── THE OVERHAUL, AND WHY IT COST NOTHING ───────────────────────
//
// Every feature in this application arrived as an ACTION, and each one took the
// only door available at the time: another entry in a horizontal bar. Twelve
// entries later that bar was a list of everything the app can do, in the order
// the work happened, on one line, unusable on a phone. Nothing was broken. It
// simply was not an application — it was an inventory.
//
// What follows is the rearrangement, and the point worth noticing is that NOT
// ONE ACTION CHANGED. No read, no mutation, no charter grant, no trigger. Only
// this file, the canvas list, and the derivation that fills them:
//
//   • three canvases instead of two, so navigation stops competing with content
//   • actions GROUPED into sections rather than listed flat
//   • a sheet, so a form stops being a page you navigate away to
//
// That is the whole nisc claim, executed rather than argued: what an app DOES
// and what an app IS ARRANGED LIKE are separate artifacts, and the second can be
// rewritten long after the first is finished. Everything below is a candidate
// for the artifact layer — the day these become rows, a studio rearranges its
// own application without a release.
//
// ── MOBILE FIRST ────────────────────────────────────────────────
//
// Top to bottom: a thin bar saying where you are and who you are; the surface,
// which takes everything left; a tab bar pinned to the bottom, where a thumb
// is. The sheet overlays the lot.
//
// The desktop version of this is the same three canvases with different CSS —
// the tab bar becomes a rail, the sheet becomes a side panel — because a
// layout that has to change to widen is a layout that hardcoded a shape.
export const frameLayout: LayoutNode = {
  component: 'Stack',
  props: { h: '100%', bg: 'ground' },
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'chrome' } },

    // THE SURFACE, AND WHO OWNS ITS EDGES.
    //
    // Every action used to open with the same four props: an inset from the
    // window, a scroll, a full height, and a page measure it centred itself in.
    // Fifteen copies, three different measures — so three screens started at
    // three different x positions, and each one had quietly decided it was a
    // full window.
    //
    // All four are the HOST's answers, not the action's. An action that pads
    // itself has assumed where it is being shown, which is exactly the
    // assumption that makes it unusable in a sheet, a rail, or a terminal that
    // is not a browser. The action now describes a column of content and
    // nothing else; this decides where that column sits.
    //
    // One measure, in one place. Change it here and every screen moves.
    {
      component: 'Box',
      props: { grow: true, scroll: true },
      children: {
        component: 'Box',
        props: { px: 24, py: 28, maxWidth: 1040, center: true },
        children: { component: 'CanvasSlot', props: { canvasId: 'main' } },
      },
    },

    // THE SHEET.
    //
    // Forms used to `push` onto `main`, which meant filling in a name replaced
    // the roll you were reading and Back was the only way home. A form is not a
    // place you go; it is a thing you do to what is already on screen. Its own
    // canvas says exactly that, and the terminal renders it as a bottom sheet on
    // a phone and a side panel on a desk — one arrangement, two shapes.
    //
    // Empty most of the time, and an empty canvas renders nothing at all.
    { component: 'CanvasSlot', props: { canvasId: 'sheet' } },
  ],
};
