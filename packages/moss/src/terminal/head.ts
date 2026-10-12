import { createHeadKeeper, headOf } from '@niscorp/nova/document';
import type { TerminalApi } from './index';

export const followHead = (api: TerminalApi, subscribe: (listener: () => void) => () => void): (() => void) => {
  if (typeof document === 'undefined') return () => undefined;
  const keep = createHeadKeeper(document);
  const read = (): void => keep(headOf(api)?.elements);
  read();
  return subscribe(read);
};
