import type { Shell } from '@niscorp/nova';

const ACTION_REF = 'action/';

// The actions a living shell holds now. Moss keeps each held action's layout
// under `action/<id>` and brings the store level when somebody is given or
// loses something; a session's own `actions` is what they held when it was built.
export const heldActions = (shell: Shell): string[] => shell.layoutStore.list().flatMap((ref) => (ref.startsWith(ACTION_REF) ? [ref.slice(ACTION_REF.length)] : []));
