import type { LayoutNode } from '@niscorp/nova';

// The frame every principal shares. Canvases stack; the last one with
// anything on it takes the rest of the screen. Each is empty for anyone who
// has nothing on it — the strip is the stage's — and an empty canvas takes no
// room. The speaker's controller and a member's phone are each one action on
// `main` whose own layout arranges its canvases (speaker/console.layout.ts,
// member/phone.layout.ts); none of them is here.
// Which renderer draws this screen: a `Look` the server sets in the shell's
// layout store under this ref (server/renderers.ts). Frame, not an action —
// nobody's screen has it as something on it. It takes no room; the browser
// reads it (src/ui/target.ts).
export const RENDERER_REF = 'renderer';

// Whether this screen shows the actions it is made of: an `Xray` the person
// switches with their X-ray button (server/functions/xray.functions.ts). Frame,
// like the renderer; the browser draws the outlines (src/ui/target.ts).
export const XRAY_REF = 'xray';

// What they draw until the server says otherwise: nova's DOM adapter, no X-ray.
export const FRAME_STORE: Record<string, LayoutNode> = {
  [RENDERER_REF]: { component: 'Look', props: { look: 'dom' } },
  [XRAY_REF]: { component: 'Xray', props: { on: false } },
};

export const frameLayout: LayoutNode = {
  component: 'Page',
  children: [
    { ref: RENDERER_REF },
    { ref: XRAY_REF },
    // Over everything, when something is open; it takes no room in the stack.
    { component: 'CanvasSlot', props: { canvasId: 'overlay' } },
    { component: 'CanvasSlot', props: { canvasId: 'strip' } },
    { component: 'CanvasSlot', props: { canvasId: 'main' } },
  ],
};
