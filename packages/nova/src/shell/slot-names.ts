// ═══════════════════════════════════════════════════════════
// Slot component name constants.
//
// Every framework adapter (React, future Vue/Svelte/etc.) must
// register components under these names in its ComponentRegistry
// to participate in shell/canvas layout rendering:
//
//   CANVAS_SLOT_NAME — renders a canvas by id (props: canvasId?)
//   ACTION_SLOT_NAME — renders an action instance by id (props: instanceId?)
//
// The shell uses these names in its default layouts and when
// flattening a render tree for non-React consumers (evaluators,
// export, testing), so they are part of the package's public
// contract — not React-only.
// ═══════════════════════════════════════════════════════════

export const CANVAS_SLOT_NAME = 'CanvasSlot';
export const ACTION_SLOT_NAME = 'ActionSlot';
