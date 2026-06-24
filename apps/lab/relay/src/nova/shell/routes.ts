// The route table — DATA mapping screen/detail action ids to URL paths. The
// router adapter (ui/router.ts) reads this to keep the shell and the address bar
// in sync; Nova itself stays URL-agnostic. A record's URL is its canonical home
// (`/companies/co_1`) regardless of where it was opened from.

// Screen (main canvas) action id → path. The deals action renders at two paths —
// `/deals` (table) and `/pipeline` (board) — distinguished by its `$.view`; see
// VIEW_PATH for the view-specific override.
export const SCREEN_PATH: Record<string, string> = {
  home: '/',
  tasks: '/tasks',
  contacts: '/contacts',
  companies: '/companies',
  deals: '/deals',
  settings: '/settings',
};

// Some screens are one action with multiple `$.view`s living at distinct paths.
// Keyed by `${action}:${view}`; consulted before SCREEN_PATH. The deals board is
// the deals action in board view.
export const VIEW_PATH: Record<string, string> = {
  'deals:board': '/pipeline',
};

// Detail (detail canvas) action id → its list segment. A detail's URL is
// `/<segment>/<id>`.
export const DETAIL_SEGMENT: Record<string, string> = {
  contact: 'contacts',
  company: 'companies',
};

// Reverse: a path's first segment → the screen action it shows, the detail action
// to open (when the path carries an id), the `$.view` to seed, and the `screen-*`
// channel to publish (defaults to `screen-<screen>`).
export const SEGMENT: Record<string, { screen: string; detail?: string; view?: string; channel?: string }> = {
  '': { screen: 'home' },
  tasks: { screen: 'tasks' },
  contacts: { screen: 'contacts', detail: 'contact' },
  companies: { screen: 'companies', detail: 'company' },
  deals: { screen: 'deals', view: 'table', channel: 'screen-deals' },
  pipeline: { screen: 'deals', view: 'board', channel: 'screen-pipeline' },
  settings: { screen: 'settings' },
};
