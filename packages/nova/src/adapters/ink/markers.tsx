import { createContext, useContext, type FC } from 'react';
import { Text as InkText } from 'ink';

// ═══════════════════════════════════════════════════════════
// Numbered markers — the TTY adapter's `[n]` addressing, on the full-screen
// kit. The HOST computes the numbering (the TTY walker's interactives table
// is the shared source of truth: same trees, same visual order, same
// numbers in both terminals) and provides a per-canvas resolver through
// context; components display their marker and adopt `marker:<n>` as their
// ink focus id so the host can jump focus by typed number. Without a
// provider (a bare kit render, the frame chrome) markers simply don't show.
// ═══════════════════════════════════════════════════════════

// (ref, identity) → the printed [n]. Repeated refs in one canvas (a list's
// rows share one ref) are disambiguated by `value` (the click payload — the
// stable identity for click-kinds) or by `occurrence` (sibling order — the
// identity for model-kinds, whose value changes as you type).
export type MarkerIdentity = { value?: unknown; occurrence?: number };
export type MarkerResolve = (ref: string, identity?: MarkerIdentity) => number | undefined;

export const CanvasMarkersContext = createContext<MarkerResolve | undefined>(undefined);

// Host controls a component may report into: a focused input claims typed
// digits as TEXT, so the host's number navigation must stand down.
export type InkFrameControls = { setTyping: (typing: boolean) => void };
export const FrameControlsContext = createContext<InkFrameControls | undefined>(undefined);

export const useMarker = (ref: string | undefined, identity?: MarkerIdentity): number | undefined => {
  const resolve = useContext(CanvasMarkersContext);
  if (resolve === undefined || ref === undefined) return undefined;
  return resolve(ref, identity);
};

// The ink focus id a marked component registers under — the host jumps here.
export const markerFocusId = (index: number): string => `marker:${index}`;

export const Mark: FC<{ index?: number }> = ({ index }) =>
  index === undefined ? null : <InkText color="cyan">[{index}] </InkText>;
