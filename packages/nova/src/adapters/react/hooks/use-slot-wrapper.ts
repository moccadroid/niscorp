import { useContext } from 'react';
import { NovaRenderContext, type SlotWrapper } from '../context';

// Reads the optional app-supplied slotWrapper from render context. Returns
// undefined when none was provided (or when called outside a provider) — the
// caller then renders content directly (passthrough). Unlike the dispatch/
// publish hooks this never throws: a missing slotWrapper is the common case.
export const useSlotWrapper = (): SlotWrapper | undefined =>
  useContext(NovaRenderContext)?.slotWrapper;
