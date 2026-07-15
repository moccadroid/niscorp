// The route table — DATA mapping screen/detail action ids to URL paths. The
// router adapter (ui/router.ts) reads this to keep the shell and the address bar
// in sync; Nova itself stays URL-agnostic. A record's URL is its canonical home
// (`/companies/co_1`) regardless of where it was opened from.

// Screen (main canvas) action id → path. The deals action renders at two paths —
// `/deals` (table) and `/pipeline` (board) — distinguished by its `$.view`; see
// VIEW_PATH for the view-specific override.
export const SCREEN_PATH: Record<string, string> = {
  home: '/',
  'tasks.manage': '/tasks',
  'crm.contacts': '/contacts',
  'crm.companies': '/companies',
  'crm.deals': '/deals',
  settings: '/settings',
};

// Some screens are one action with multiple `$.view`s living at distinct paths.
// Keyed by `${action}:${view}`; consulted before SCREEN_PATH. The deals board is
// the deals action in board view.
export const VIEW_PATH: Record<string, string> = {
  'crm.deals:board': '/pipeline',
};

// Reverse: a path's first segment → the screen action it shows, the `$.view` to
// seed, and the `screen-*` channel to publish (defaults to `screen-<screen>`;
// set explicitly wherever the action id and the channel name diverge).
// (Records drill on the main stack now; deep-linking a drilled record is a later
// pass, so there's no per-record segment here.)
export const SEGMENT: Record<string, { screen: string; view?: string; channel?: string }> = {
  '': { screen: 'home' },
  tasks: { screen: 'tasks.manage', channel: 'screen-tasks' },
  contacts: { screen: 'crm.contacts', channel: 'screen-contacts' },
  companies: { screen: 'crm.companies', channel: 'screen-companies' },
  deals: { screen: 'crm.deals', view: 'table', channel: 'screen-deals' },
  pipeline: { screen: 'crm.deals', view: 'board', channel: 'screen-pipeline' },
  settings: { screen: 'settings' },
};
