// React's CSSProperties is closed; module augmentation (the mechanism its
// own comment recommends) opens it for the --m-* custom properties the kit
// sets. An interface is required here — augmentation can't merge into a type.
import 'react';

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
