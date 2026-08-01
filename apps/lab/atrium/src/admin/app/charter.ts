import type { Charter } from '@niscorp/charter';

// The administration tool's own charter — two roles, and one of them is empty.
//
// `public: []` is the entire authentication story and it is worth reading
// twice: an anonymous principal resolves to no actions, so moss builds a shell
// with nothing in it, so every canvas serves an empty tree. A stranger who
// finds this port does not get a login page to attack; they get an application
// with no surfaces. Nothing is hidden, because nothing is there.
//
// There is no `data` section anywhere, and there never will be: this service
// mounts no vex and owns no database. Everything it shows comes from the
// operator seam over the `fn:` handlers, which is what keeps the trust boundary
// structural — there is no path from a pane to a hotel's rows because there is
// no engine underneath to ask.
export const ADMIN_CHARTER: Charter = {
  public: [],
  operator: { actions: ['admin.*'] },
};

// Our staff. One entry today; a real deployment mints one per person and the
// tool is unchanged.
export const ADMIN_ASSIGNMENTS: Record<string, readonly string[]> = {
  op_atrium: ['operator'],
};
