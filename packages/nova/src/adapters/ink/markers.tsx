import { createContext, useContext, type FC } from 'react';
import { Text as InkText } from 'ink';

// Tells repeated refs in one canvas apart: `value` is the click payload;
// `occurrence`, the sibling order, is for a model-bound field, whose value changes.
export type MarkerIdentity = { value?: unknown; occurrence?: number };
export type MarkerResolve = (ref: string, identity?: MarkerIdentity) => number | undefined;

export const CanvasMarkersContext = createContext<MarkerResolve | undefined>(undefined);

// A focused input takes typed digits as text: the host's number navigation stands down.
export type InkFrameControls = { setTyping: (typing: boolean) => void };
export const FrameControlsContext = createContext<InkFrameControls | undefined>(undefined);

export const useMarker = (ref: string | undefined, identity?: MarkerIdentity): number | undefined => {
  const resolve = useContext(CanvasMarkersContext);
  if (resolve === undefined || ref === undefined) return undefined;
  return resolve(ref, identity);
};

export const markerFocusId = (index: number): string => `marker:${index}`;

export const Mark: FC<{ index?: number }> = ({ index }) =>
  index === undefined ? null : <InkText color="cyan">[{index}] </InkText>;
