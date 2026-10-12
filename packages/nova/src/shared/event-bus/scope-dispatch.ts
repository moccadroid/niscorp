import type { NovaEvent } from './schemas';

export const scopeDispatch = (
  dispatch: (event: NovaEvent) => void,
  origin: string,
): ((event: NovaEvent) => void) => {
  return (event) => dispatch(event.origin === undefined ? { ...event, origin } : event);
};
