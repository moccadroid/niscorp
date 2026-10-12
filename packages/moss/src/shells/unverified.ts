import type { Shell } from '@niscorp/nova';
import { wholeShellOf } from './build';

export const unverifiedShell = (session: { readonly shell: Shell }): Shell => wholeShellOf(session.shell);
