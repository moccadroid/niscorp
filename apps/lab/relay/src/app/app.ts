import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { CHARTER } from './charter/charter';
import { ASSIGNMENTS } from './charter/assignments';
import { CATALOG_DEFINITIONS } from '@relay/app/action-catalog';
import { ENTRIES, MUTATION_ENTRIES } from '@relay/app/vex';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { RESOURCES } from '@relay/app/vex/resources';
import { mainStackLayout, asideStackLayout } from '@relay/app/shell/stack-nav.layout';
import { frameLayout } from '@relay/app/shell/frame.layout';
import { LAYOUT_VARIANTS } from '@relay/app/layout-variants';
import { modalFragment } from '@relay/app/shell/fragments/modal.fragment';
import { quickviewFragment } from '@relay/app/shell/fragments/quickview.fragment';
import { panelFragment } from '@relay/app/shell/fragments/panel.fragment';
import { dockFragment } from '@relay/app/shell/fragments/dock.fragment';
import { createDevtoolsFunctions, DEVTOOLS_CANVAS } from '@niscorp/nova/devtools';
import { USERS } from '@relay/server/users';
import { authFunctions } from '@relay/server/functions/auth';
import { rayFunctions } from '@relay/server/functions/ray';
import { modelFunctions } from '@relay/server/functions/models';
import { buildRegistry } from '@relay/ui';

export const buildRelay = (): NiscApp => defineApp({
  charter: CHARTER,
  assignments: ASSIGNMENTS,
  actions: CATALOG_DEFINITIONS,
  layouts: LAYOUT_VARIANTS,
  entries: [...ENTRIES, ...MUTATION_ENTRIES],
  behaviors: scopeBehaviors,
  resources: RESOURCES,
  functions: (session) => [
    ...rayFunctions(session),
    ...authFunctions(session),
    ...modelFunctions(),
    ...createDevtoolsFunctions({ shell: () => session.shell, definitions: CATALOG_DEFINITIONS }),
  ],
  shell: {
    canvases: [
      { id: 'sidebar', initial: { action: 'chrome.sidebar' } },
      { id: 'topbar', initial: { action: 'chrome.topbar' } },
      // The first of these the principal holds mounts: `home` for a member,
      // the login screen for anonymous.
      { id: 'main', actionLayout: mainStackLayout, initial: ['home', 'auth.login'] },
      { id: 'aside', actionLayout: asideStackLayout },
      { id: 'modal' },
      { id: DEVTOOLS_CANVAS },
    ],
    layout: frameLayout,
    // The session renders only the components it is told of, or that a shipped screen uses: a generated screen may use any of relay's.
    components: Object.fromEntries(buildRegistry().list().map((name) => [name, {}])),
    fragments: { modal: modalFragment, quickview: quickviewFragment, panel: panelFragment, dock: dockFragment },
    inputs: ({ principal, actions, roles }) => {
      const has = (id: string): boolean => actions.includes(id);
      return {
        sidebar: {
          nav: {
            home: has('home'),
            tasks: has('tasks.manage'),
            pipeline: has('crm.deals'),
            contacts: has('crm.contacts'),
            companies: has('crm.companies'),
            deals: has('crm.deals'),
            settings: has('settings'),
          },
          user: {
            name: USERS.find((u) => u.id === principal)?.name ?? '',
            roles: roles.join(' · '),
          },
        },
        topbar: { allowedIds: [...actions] },
      };
    },
  },
});
