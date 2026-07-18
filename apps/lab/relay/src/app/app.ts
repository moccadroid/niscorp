import { defineApp } from '@niscorp/moss';
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
import { USERS } from '@relay/server/users';
import { authFunctions } from '@relay/server/functions/auth';
import { rayFunctions } from '@relay/server/functions/ray';

// ═══════════════════════════════════════════════════════════
// Relay, the application, as data. Every field is an authored ARTIFACT —
// the policy document, who wears what, the action definitions, the row
// behaviors, the resource subgraphs, the shell's canvases and fragments.
// The server derives everything else from these plus a database (whose
// seeded vex_cache IS the API surface). The one derivation relay owns is
// `shell.inputs`: per-principal boot input for the chrome.
// ═══════════════════════════════════════════════════════════

export const relay = defineApp({
  charter: CHARTER,
  assignments: ASSIGNMENTS,
  actions: CATALOG_DEFINITIONS,
  // Ring 2: layout variants by minted id — the charter's `layouts` section
  // selects who holds which; everyone else gets the base on the definition.
  layouts: LAYOUT_VARIANTS,
  entries: [...ENTRIES, ...MUTATION_ENTRIES],
  behaviors: scopeBehaviors,
  resources: RESOURCES,
  // The `fn:` escape hatch, server-side: Ray + the magic-link pair. Built
  // per session — handlers close over the session's shell and policy.
  functions: (session) => ({ ...rayFunctions(session), ...authFunctions(session) }),
  shell: {
    // Canvases are data; mounting is the server's derivation — an initial
    // the principal doesn't hold simply doesn't mount (anonymous gets no
    // `home`; their application is the client-side lock screen).
    canvases: [
      { id: 'sidebar', initial: { action: 'chrome.sidebar' } },
      { id: 'topbar', initial: { action: 'chrome.topbar' } },
      // Candidates: members boot home; anonymous holds only the lock
      // screen, so that is their application.
      { id: 'main', actionLayout: mainStackLayout, initial: ['home', 'auth.login'] },
      { id: 'aside', actionLayout: asideStackLayout },
      { id: 'modal' },
    ],
    // The frame — the canvas arrangement, served to terminals as data.
    layout: frameLayout,
    fragments: { modal: modalFragment, quickview: quickviewFragment, panel: panelFragment, dock: dockFragment },
    // Per-principal boot input — the sidebar renders only granted screens
    // (boot input, not a variant), the topbar's palette searches only the
    // granted catalog.
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
