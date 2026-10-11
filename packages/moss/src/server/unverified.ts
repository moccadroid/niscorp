import type { Shell } from '@niscorp/nova';
import { wholeShellOf } from '../shells';

// This file is an entry point: `@niscorp/moss/unverified`.
//
// On a session's `shell` the members that change what a shell is made of
// throw: `registerAction`, `removeAction`, `registerFragment`, `addCanvas`,
// `removeCanvas`, `setCanvasLayout`, `setLayout`, `setPhrases`, `dispose`.
// Those go around moss: an action registered this way is not verified against
// the charter or the app's kit, is in nobody's catalog, and is gone when the
// shell is rebuilt. `unverifiedShell(session)` hands out the whole nova shell
// for code that does it anyway, so the file that does it says so in its
// imports.
export const unverifiedShell = (session: { readonly shell: Shell }): Shell => wholeShellOf(session.shell);
