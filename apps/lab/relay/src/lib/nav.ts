// ═══════════════════════════════════════════════════════════
// The navigation seam for kit components.
//
// A nova component renders inside a served tree — it holds no wire and no
// shell (the shell is server-side; the browser paints what it is sent). The
// two navigation gestures that are NOT a screen's own business — back, and
// jumping to an ancestor already on a canvas's stack — therefore need a way
// out of the kit. `main.tsx` owns the wire and registers them here; a
// component imports the verb and stays ignorant of the transport.
//
// Deliberately not `window`: the surface is two typed functions with a
// no-op default, so a component that navigates in a context without a wire
// (a test render, the dom target, an exporter) does nothing rather than
// throwing on somebody's click.
// ═══════════════════════════════════════════════════════════

type Nav = {
  back: () => void;
  popTo: (canvas: string, instance: string) => void;
};

const noop: Nav = { back: () => undefined, popTo: () => undefined };

let nav: Nav = noop;

export const registerNav = (next: Nav): void => {
  nav = next;
};

// Undo the session's last navigation — one gesture over the whole shell.
export const navBack = (): void => nav.back();

// Jump to an ancestor on a canvas's stack: ONE message the shell executes
// atomically. The alternative — N chained back gestures — raced the browser's
// own history repair and dropped presses.
export const navPopTo = (canvas: string, instance: string): void => nav.popTo(canvas, instance);
