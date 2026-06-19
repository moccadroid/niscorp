// The route table — DATA mapping screen/detail action ids to URL paths. The
// router adapter (ui/router.ts) reads this to keep the shell and the address bar
// in sync; Nova itself stays URL-agnostic. A record's URL is its canonical home
// (`/companies/co_1`) regardless of where it was opened from.

// Screen (main canvas) action id → path. NB: the Pipeline screen's action id is
// `deals-board` (the Kanban), distinct from the `deals` table screen.
export const SCREEN_PATH: Record<string, string> = {
  home: '/',
  tasks: '/tasks',
  contacts: '/contacts',
  companies: '/companies',
  deals: '/deals',
  'deals-board': '/pipeline',
  settings: '/settings',
};

// Detail (detail canvas) action id → its list segment. A detail's URL is
// `/<segment>/<id>`.
export const DETAIL_SEGMENT: Record<string, string> = {
  'contact-detail': 'contacts',
  'company-detail': 'companies',
};

// Reverse: a path's first segment → the screen action it shows, and (when the
// path carries an id) the detail action to open.
export const SEGMENT: Record<string, { screen: string; detail?: string }> = {
  '': { screen: 'home' },
  tasks: { screen: 'tasks' },
  contacts: { screen: 'contacts', detail: 'contact-detail' },
  companies: { screen: 'companies', detail: 'company-detail' },
  deals: { screen: 'deals' },
  pipeline: { screen: 'deals-board' },
  settings: { screen: 'settings' },
};
