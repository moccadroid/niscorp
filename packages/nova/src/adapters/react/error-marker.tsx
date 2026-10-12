import type { FC } from 'react';

export type ErrorMarkerProps = {
  code: string;
  message: string;
};

export const ErrorMarker: FC<ErrorMarkerProps> = ({ code, message }) => (
  <span data-nova-error={code} role="alert">
    {`[${code}] ${message}`}
  </span>
);
