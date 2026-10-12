import type { Charter } from '@niscorp/charter';

export const CHARTER: Charter = {
  public: ['auth.login', 'about.page'],

  guest: {
    // `ext.guest.*` is the bundle namespace: every guest action an integration
    // ships arrives under it.
    actions: ['chrome.guest', 'concierge', 'assistant', 'stay.*', 'ext.guest.*', 'about.*'],
    data: [
      'stays.read',
      'guests.read',
      'rooms.read',
      'properties.read',
      'connectors.read',
      'property_connectors.read',
      'request_options.read',
      // The menu read joins the offer table to resolve options against what the
      // connector has enabled. No PII in it.
      'connector_capabilities.read',
      'folio_lines.read',
      'messages.read',
      'issues.read',
      'property_slots.read',
      'surface_slots.read',
      'capabilities.read',
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
      // `stay_notes` is absent on purpose: what the desk writes down about a
      // guest must never resolve onto the shell of the person it is about.
      'assistants.read',
      'assistant_turns.read',
      'assistant_turns.write.insert',
      'assistant_runs.write.insert',
      'seen_marks.read',
      'seen_marks.write.insert',
    ],
  },

  staff: {
    actions: ['chrome.staff', 'assistant', 'staff.*', 'about.*'],
    // `staff.write.update` is narrow twice over: the row behavior pins it to the
    // caller's own row, and mutations are replay-only, with only
    // `layout_control` and `assistant_model` settable.
    data: ['stays.read', 'stay_groups.read', 'guests.read', 'rooms.read', 'properties.read', 'connectors.read', 'issues.read', 'tasks.read', 'staff.read', 'staff.write.update', 'property_slots.read', 'surface_slots.read', 'capabilities.read', 'spa_bookings.read', 'wake_calls.read', 'transfers.read', 'stay_requests.read', 'stay_notes.read', 'handovers.read', 'assistants.read', 'assistant_turns.read', 'assistant_turns.write.insert', 'assistant_runs.write.insert', 'seen_marks.read', 'seen_marks.write.insert'],
  },

  desk: {
    extends: ['staff'],
    actions: ['desk.*', 'ext.desk.*'],
    data: [
      'issues.write.insert',
      'issues.write.update',
      'tasks.write.insert',
      'tasks.write.update',
      'messages.read',
      'messages.write.insert',
      'folio_lines.read',
      'folio_lines.write.insert',
      'folio_lines.write.update',
      'stays.write.update',
      // The desk's sign-off and the manager's out-of-service are both
      // `rooms.status`; the charter cannot tell those apart.
      'rooms.write.update',
      'spa_bookings.write.insert',
      'spa_bookings.write.update',
      'wake_calls.write.insert',
      'wake_calls.write.update',
      'transfers.write.insert',
      'transfers.write.update',
      'stay_requests.write.update',
      'stay_notes.write.insert',
      'stay_notes.write.update',
      'handovers.write.insert',
      'request_options.read',
      'connector_capabilities.read',
      'property_connectors.read',
    ],
  },

  service: {
    extends: ['staff'],
    actions: ['service.*'],
    data: ['tasks.write.update'],
  },

  ops: {
    extends: ['staff'],
    actions: ['ops.*', 'ext.ops.*'],
    data: ['property_capabilities.read', 'property_capabilities.write.update', 'rooms.write.update', 'issues.write.update', 'property_connectors.read', 'connector_capabilities.read'],
  },

  // The integrator takes `chrome.staff` for the top bar but not
  // `extends: ['staff']`: that would grant the staff data reads.
  vendor: {
    actions: ['chrome.staff', 'assistant', 'deploy.*', 'about.*'],
    data: ['connectors.read', 'connectors.write.update', 'connector_capabilities.read', 'connector_capabilities.write.update', 'capabilities.read', 'properties.read', 'property_connectors.read', 'property_slots.read', 'surface_slots.read', 'assistants.read', 'assistant_turns.read', 'assistant_turns.write.insert', 'assistant_runs.write.insert'],
  },

  // The engine's own principal, for dev checks and the connector sync's
  // read-back. Never assigned to a human.
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
