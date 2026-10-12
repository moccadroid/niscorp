import { useContext } from 'react';
import { NovaRenderContext, type SlotWrapper } from '../context';

export const useSlotWrapper = (): SlotWrapper | undefined =>
  useContext(NovaRenderContext)?.slotWrapper;
