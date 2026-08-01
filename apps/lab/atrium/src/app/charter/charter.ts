import type { Charter } from '@niscorp/charter';

// Atrium's charter — the CEILING. Two sections, one grammar: `actions` selects
// which nova action ids exist for a principal, `data` selects the vex verb
// leaves their policy is compiled from.
//
// Read it next to `property_slots` to understand the app. The charter says what
// a role may EVER hold; the resolved surface says what is placed right now. Both
// are needed and they answer different questions:
//
//   charter   — compiled and verified at boot, moves at the speed of a release
//   surface   — resolved from the live connector version, moves at any moment
//
// A guest holds `stay.key` in the charter at every property on earth. Whether
// the key action is ON their shell is the connector's answer, not this file's.
// Nothing in a layout ever asks either question.
export const CHARTER: Charter = {
  public: ['auth.login'],

  // ── the guest ────────────────────────────────────────────
  // Everything a guest can ever be shown. Note what is absent and stays absent:
  // no issue board, no other stays, no folio but their own, and no verb that
  // could comp a room. A guest asking for a discount produces a message on the
  // desk's board, because the control to grant one does not exist here.
  guest: {
    // `ext.guest.*` is the BUNDLE namespace: every guest action an integration
    // ships arrives under it, so the ceiling was written once and a new bundle
    // action needs no charter edit. Whether it is PLACED stays the resolver's
    // answer, per property, per stay state.
    actions: ['chrome.guest', 'concierge', 'assistant', 'stay.*', 'ext.guest.*'],
    data: [
      'stays.read',
      'guests.read',
      'rooms.read',
      'properties.read',
      'connectors.read',
      'property_connectors.read',
      'request_options.read',
      // The menu read resolves options against what the connector has ENABLED —
      // that join needs the offer table, read-only, no PII in it.
      'connector_capabilities.read',
      'folio_lines.read',
      'messages.read',
      'issues.read',
      'property_slots.read',
      'surface_slots.read',
      'capabilities.read',
      // What a guest writes: a message, a request that becomes an issue, their
      // own arrival/departure state — and through the bundles, their own spa
      // bookings, wake calls, asks, and folio charges whose price came from a
      // connector row. Updates on the mirrors are cancels; the tenant behaviors
      // pin every one to their hotel.
      'messages.write.insert',
      'issues.write.insert',
      'stays.write.update',
      'spa_bookings.read',
      'spa_bookings.write.insert',
      'spa_bookings.write.update',
      'wake_calls.read',
      'wake_calls.write.insert',
      'wake_calls.write.update',
      'transfers.read',
      'transfers.write.insert',
      'transfers.write.update',
      'stay_requests.read',
      'stay_requests.write.insert',
      'folio_lines.write.insert',
      // NOT here, on purpose: `stay_notes`. What the desk writes down about a
      // guest is the desk's, and a note reading "do not upgrade — complained
      // last time" must never resolve onto the shell of the person it is about.
      // The absence IS the rule; there is no flag anywhere that hides them.
      'assistants.read',
      'assistant_turns.read',
      'assistant_turns.write.insert',
      'assistant_runs.write.insert',
      'seen_marks.read',
      'seen_marks.write.insert',
    ],
  },

  // ── the hotel ────────────────────────────────────────────
  // The staff floor: chrome plus the reads every job needs.
  staff: {
    // `staff.*` is the floor every job stands on: the menu they navigate by and
    // the settings for their own screen. Not per-role, because it is not about
    // the job — it is about the person working it.
    actions: ['chrome.staff', 'assistant', 'staff.*'],
    // The floor includes reading the bundle mirrors — every job sees the spa
    // diary, the call sheet and the ask queue; who may MOVE them is per role.
    //
    // `staff.write.update` is the narrowest write in the file, and it is narrow
    // twice over: the row behavior pins it to the caller's OWN row, and the two
    // mutations that exist set one column each — `layout_control` and
    // `assistant_model`, both their own settings. A clerk cannot promote
    // themselves, because no query says how, and mutations are replay-only, so
    // the shipped list is the whole vocabulary.
    //
    // `stay_notes.read` and `handovers.read` are on the FLOOR rather than on the
    // desk, because a housekeeper walking into a room whose guest is celebrating
    // an anniversary should know it, and the shift note is addressed to whoever
    // walks in next. Writing either is per role, below.
    data: ['stays.read', 'stay_groups.read', 'guests.read', 'rooms.read', 'properties.read', 'connectors.read', 'issues.read', 'tasks.read', 'staff.read', 'staff.write.update', 'property_slots.read', 'surface_slots.read', 'capabilities.read', 'spa_bookings.read', 'wake_calls.read', 'transfers.read', 'stay_requests.read', 'stay_notes.read', 'handovers.read', 'assistants.read', 'assistant_turns.read', 'assistant_turns.write.insert', 'assistant_runs.write.insert', 'seen_marks.read', 'seen_marks.write.insert'],
  },

  desk: {
    extends: ['staff'],
    actions: ['desk.*', 'ext.desk.*'],
    // The desk triages, dispatches and works a stay. It does NOT delete an
    // issue — the record of what a guest reported outlives the shift. Through
    // the bundles it also runs the diary and the call sheet, answers asks, and
    // posts the folio lines those answers carry.
    data: [
      'issues.write.insert',
      'issues.write.update',
      'tasks.write.insert',
      'tasks.write.update',
      'messages.read',
      'messages.write.insert',
      'folio_lines.read',
      'folio_lines.write.insert',
      // Correcting a bill is a distinct power from posting to one, and the
      // charter says so in two grants rather than one umbrella: a clerk who
      // may add a charge is not automatically a clerk who may take one off.
      // Which SURFACE performs it is the integration's business (Opera and
      // Mews each ship their own); that it is permitted at all is ours.
      'folio_lines.write.update',
      'stays.write.update',
      // The desk moves people between rooms and signs turned rooms off as
      // sellable — both are `rooms.status`, both happen forty times a shift.
      // The manager's power over the same column is a DIFFERENT decision (out
      // of service for a fortnight) made on a different surface; the charter
      // cannot tell those apart and does not try. What it does say is that the
      // front office may move room state at all, which it must: a guest with a
      // rattling air conditioner has to sleep somewhere.
      'rooms.write.update',
      // The crew HALVES of the guest capabilities: the desk sets a wake call,
      // books a treatment, posts minibar FOR a guest — creates, not just
      // works-what-exists. Every guest-writable mirror has a desk insert.
      'spa_bookings.write.insert',
      'spa_bookings.write.update',
      'wake_calls.write.insert',
      'wake_calls.write.update',
      'transfers.write.insert',
      'transfers.write.update',
      'stay_requests.write.update',
      // What the desk writes down and hands on. Notes update as well as insert
      // — a preference that turns out to be wrong is corrected, not stacked —
      // and the handover is insert-only, because a shift note somebody else has
      // already read is not a thing you go back and edit.
      'stay_notes.write.insert',
      'stay_notes.write.update',
      'handovers.write.insert',
      // The catalogue read (menus, times, items) joins the connector tables —
      // estate reads, no PII, and the crew halves order from the same menus
      // the guests do.
      'request_options.read',
      'connector_capabilities.read',
      'property_connectors.read',
    ],
  },

  service: {
    extends: ['staff'],
    actions: ['service.*'],
    // Housekeeping and maintenance move work forward and nothing else.
    data: ['tasks.write.update'],
  },

  ops: {
    extends: ['staff'],
    actions: ['ops.*', 'ext.ops.*'],
    // The manager owns their own house: which services this property offers,
    // and which rooms are sellable. The Integrations pane reads what each of
    // the house's connectors OFFERS; flipping the offer itself is the vendor's.
    data: ['property_capabilities.read', 'property_capabilities.write.update', 'rooms.write.update', 'issues.write.update', 'property_connectors.read', 'connector_capabilities.read'],
  },

  // ── us ───────────────────────────────────────────────────
  // The integrator. One write that matters: moving a connector's live version.
  //
  // Takes `chrome.staff` for the top bar (nav across its own panes, and a way
  // out) but NOT `extends: ['staff']` — that would grant the staff DATA reads,
  // and shipping an integration never requires reading a guest's folio. Chrome
  // is an action grant; the data grants stay exactly this narrow.
  vendor: {
    actions: ['chrome.staff', 'assistant', 'deploy.*'],
    // The one write that matters is now the capability SWITCH: enabling what a
    // connector offers, then going live. Versions are provenance it reads.
    data: ['connectors.read', 'connectors.write.update', 'connector_capabilities.read', 'connector_capabilities.write.update', 'capabilities.read', 'properties.read', 'property_connectors.read', 'property_slots.read', 'surface_slots.read', 'assistants.read', 'assistant_turns.read', 'assistant_turns.write.insert', 'assistant_runs.write.insert'],
  },

  // The engine's own principal — dev checks and the connector sync's read-back.
  // Never assigned to a human; an unlisted verb dies even here.
  system: {
    data: [
      'stays.read',
      'guests.read',
      'rooms.read',
      'properties.read',
      'connectors.read',
      'connector_capabilities.read',
      'property_connectors.read',
      'request_options.read',
      'capabilities.read',
      'property_capabilities.read',
      'property_slots.read',
      'surface_slots.read',
      'folio_lines.read',
      'messages.read',
      'issues.read',
      'tasks.read',
      'staff.read',
      'live_capabilities.read',
      'assistants.read',
      'assistant_turns.read',
      'assistant_turns.write.*',
      'seen_marks.read',
      'seen_marks.write.*',
      'issues.write.*',
      'tasks.write.*',
      'messages.write.*',
      'stays.write.*',
      'rooms.write.*',
      'connectors.write.*',
      'connector_capabilities.write.*',
      'property_capabilities.write.*',
      'bundle_actions.read',
      'bundle_entries.read',
      'stay_groups.read',
      'stay_notes.read',
      'stay_notes.write.*',
      'handovers.read',
      'handovers.write.*',
      'spa_bookings.read',
      'spa_bookings.write.*',
      'wake_calls.read',
      'wake_calls.write.*',
      'transfers.read',
      'transfers.write.*',
      'stay_requests.read',
      'stay_requests.write.*',
      'folio_lines.write.*',
    ],
  },
};
