import type { FC } from 'react';

export type ErrorMarkerProps = {
  code: string;
  message: string;
};

// Renders error RenderNodes surfaced by the renderer in lax mode.
// Consumers can style via the `data-nova-error` attribute.
export const ErrorMarker: FC<ErrorMarkerProps> = ({ code, message }) => (
  <span data-nova-error={code} role="alert">
    {`[${code}] ${message}`}
  </span>
);
