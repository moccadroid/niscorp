import { hydrateRoot } from 'react-dom/client';
import { NovaShell } from '@niscorp/nova/adapters/react';
import type { Shell } from '@niscorp/nova';

export const Screen = ({ shell }: { shell: Shell }): React.JSX.Element => <NovaShell shell={shell} />;

export const adopt = (root: HTMLElement, shell: Shell): void => {
  hydrateRoot(root, <Screen shell={shell} />);
};
