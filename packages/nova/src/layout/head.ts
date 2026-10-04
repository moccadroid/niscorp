// ═══════════════════════════════════════════════════════════
// THE HEAD — what a screen says it is, as a node in its layout.
//
// A document has a part nobody sees on the screen: its title, the sentence
// that describes it, the picture shown where a link to it is pasted. Those are
// facts about what the screen shows, so they come from where everything else
// on the screen comes from — a layout node, its props bound to the action's
// data — and travel the way everything else does, in the render tree.
//
// The node draws nothing. No adapter builds an element for it and no registry
// has to hold it. Whoever writes the document reads it off the tree (`headOf`)
// and says it in the surface's own terms: a browser's <head>, a tab's title.
//
// The props say what the screen IS, from a closed set of names
// (./head.schema). How that is spelled in tags is the writer's business, and
// where the document lives (its address) is not the screen's to say at all — a
// layout never holds a URL of its own page.
//
// This file holds no schema on purpose: a terminal that only reads a head off
// the wire needs the name and the shape, and nothing to validate with.
// ═══════════════════════════════════════════════════════════

// Namespaced as a package's own in-layout components are (`loom:field`), so it
// can never be a name an app's kit already uses for something else.
export const HEAD_NAME = 'nova:head';

// What a head node said, once its bindings are resolved and anything it left
// empty is gone.
export type Head = {
  title?: string;
  description?: string;
  image?: string;
  kind?: 'website' | 'article';
  structured?: Record<string, unknown> | Record<string, unknown>[];
};
