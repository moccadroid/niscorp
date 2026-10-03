import { hydrateRoot } from 'react-dom/client';
import { NovaShell } from '@niscorp/nova/adapters/react';
import type { Shell } from '@niscorp/nova';

// The screen: the shell's frame and canvases, drawn with the shell's own kit.
// Drawn three ways from this one description — to markup at build
// (nisc.config.ts), over that markup in the page (`adopt`), and from nothing
// in dev (src/main.tsx).
export const Screen = ({ shell }: { shell: Shell }): React.JSX.Element => <NovaShell shell={shell} />;

// Pick up a screen that arrived drawn — the one call both the page and the
// build's adoption check make.
export const adopt = (root: HTMLElement, shell: Shell): void => {
  hydrateRoot(root, <Screen shell={shell} />);
};
