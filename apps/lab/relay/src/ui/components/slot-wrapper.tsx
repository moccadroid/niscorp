import { Fragment } from 'react';
import type { SlotWrapper } from '@niscorp/nova/react';

// Screen content fades in when it appears — a calm, uniform entrance (the `key`
// replays it for each new instance). No slide, no presence.
//
// The `modal` canvas is passed through untouched: it brings its own entrance
// (.rl-overlay fade + .rl-dialog pop). Wrapping it in this fade too would stack
// three opacity ramps from 0 — and nested opacities multiply, so the dialog
// sits near-invisible through the first half of the animation and reads as a
// delay before it appears. The overlay owns the modal's entrance.
//
// Animating the *layout* itself (the detail panel pushing the list open) is a
// separate, deferred problem — the footprint still appears instantly; only the
// content fades.
export const relaySlotWrapper: SlotWrapper = ({ canvasId, instanceId, children }) => {
  // An empty slot must render NO DOM, so a sized canvas region (e.g. `.rl-aside`)
  // collapses via `:empty`. ActionSlot renders this wrapper persistently even
  // when the canvas is empty (for exit animations we don't use), so guard on
  // instanceId — render nothing when there's no instance.
  if (canvasId === 'modal' || instanceId === undefined) return <Fragment>{children}</Fragment>;
  return (
    <div key={instanceId} className="rl-fade-in">
      {children}
    </div>
  );
};
