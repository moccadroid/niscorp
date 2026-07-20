import { NovaShell } from '@niscorp/nova/adapters/react';
import { shell } from './nova/shell';

// Fable is a Nova shell. Everything visible — topbar, the list, the form —
// is an action on a canvas, composed from primitives. React only mounts it.
export const Fable = () => <NovaShell shell={shell} />;
