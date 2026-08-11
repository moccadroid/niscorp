import type { Charter } from '@niscorp/charter';

// THE TOOL'S OWN CHARTER — two roles, and one of them is empty.
//
// `public: []` is the entire authentication story and it is worth reading
// twice: an anonymous principal resolves to no actions, so moss builds a shell
// with nothing in it, so every canvas serves an empty tree. A stranger who
// finds this port does not get a login page to attack; they get an application
// with no surfaces. Nothing is hidden, because nothing is there.
//
// There is no `data` section and there never will be. This service mounts no
// vex and owns no database — everything it shows comes from Lyra's operator
// seam through `fn:` handlers, which keeps the trust boundary structural rather
// than enforced: there is no path from a pane to a studio's rows, because there
// is no engine underneath to ask.
export const ADMIN_CHARTER: Charter = {
  public: [],
  operator: { actions: ['admin.*'] },
};

// Our staff. One entry today; a real deployment mints one per person and the
// tool is unchanged.
export const ADMIN_ASSIGNMENTS: Record<string, readonly string[]> = {
  op_lyra: ['operator'],
};
