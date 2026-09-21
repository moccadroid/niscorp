import type { Charter } from '@niscorp/charter';

// ENCORE'S CHARTER — and, in this app, the decision model's vocabulary.
//
// Two sections, one grammar: `actions` selects which nova action ids exist for
// a principal, `data` the vex verb leaves their policy is compiled from. What
// is new here is who else reads ring 1. The intent loop derives its questions
// from the principal's RESOLVED catalog, so an action a role lacks is not a
// refused option — it is never a question. The liaison cannot be offered a
// slot swap by a confused model, a clever sentence or a prompt injection in a
// vendor's name, because there is no question whose answer could be "yes".
//
// `public: []` is the whole anonymous story: no actions, so an empty shell.
export const CHARTER: Charter = {
  public: [],

  // The ops tent. Everything the app ships, and every table behind it.
  operator: {
    actions: ['intent.*', 'assist.*', 'site.*', 'stage.*', 'lineup.*', 'act.*', 'weather.*', 'crowd.*', 'attendance.*', 'situation.*', 'incident.*', 'move.*', 'attention.*', 'director.*', 'sales.*', 'slot.*', 'set.*', 'push.*'],
    data: [
      'acts.read',
      'stages.read',
      'slots.read',
      'zones.read',
      'zone_counts.read',
      'gates.read',
      'crew.read',
      'weather_hours.read',
      'sales_hourly.read',
      'incidents.read',
      'delays.read',
      'pushes.read',
      // The running order is the operator's to move; holds and pushes are
      // ledger rows, insert-only on purpose — nobody edits what was sent.
      'slots.write.update',
      'delays.write.insert',
      'pushes.write.insert',
      // THE THREAD. Insert-only, like the other ledgers: a turn that was said
      // was said. Whose rows these are is not a grant — the engine stamps and
      // fences them per principal (vex/behaviors.ts).
      'agent_turns.read',
      'agent_turns.write.insert',
      // THE FEEDS, to read: the room watches on the operator's behalf, under the
      // operator's policy. And their own clicks on what it raised.
      'gate_scans.read',
      'festival_clock.read',
      'attention_labels.read',
      'attention_labels.write.insert',
    ],
  },

  // THE FEED. No actions — it has no screen — and exactly the writes a festival's
  // instruments make: counts move, incidents are reported and closed, a scanner
  // fails, time passes. It cannot move a set, hold one, or send a push: those are
  // decisions, and decisions are a person's.
  director: {
    actions: [],
    data: ['zone_counts.write.update', 'incidents.write.insert', 'incidents.write.update', 'gates.write.update', 'gate_scans.write.insert', 'festival_clock.write.update', 'festival_clock.read'],
  },

  // The person who looks after the traders. They watch the takings and the
  // crowd, and they can message — and that is all. NOT here, deliberately:
  // `slot.*`, `set.*`, `act.*`, `lineup.*`, `stage.*`, `weather.*`, and with
  // them every read of the bill. The absence IS the rule; no layout hides
  // anything and no handler checks a role.
  'vendor-liaison': {
    // `assist.*` is the agent's card. Holding it lets the agent answer, write
    // and plan for them — over THEIR narrowed catalog, THEIR context packs and
    // THEIR readable queries, so it can no more propose a slot swap or look up
    // the running order than the fast model can. With it comes a thread of
    // their own (`agent_turns`): the same two leaves the operator holds, and
    // rows neither of them can see of the other.
    //
    // NOT theirs, deliberately: `situation.now` and `incident.feed`. Both read
    // `incidents` — medical and security reports, with where they happened —
    // and the first reads the bill and the weather as well. A trader's liaison
    // has no business in an injury log, and a card whose five sections would
    // each come back refused is not a smaller overview, it is a broken one. So
    // their "what's going on?" is answered from what they do hold: footfall,
    // the crowd gauge, the takings. The `situation` and `incidents` context
    // packs fall away with the tables, by the same rule that drops the cards.
    //
    // `attendance.now` is theirs ON PURPOSE. Footfall is a trader's first
    // question, and the card reads nothing they could not already read: it is
    // `zones` and `zone_counts` summed, the same two tables behind the gauge and
    // the map they hold. Granting it widens no data; withholding it would only
    // mean the liaison's room could not answer "how busy is it?" either.
    // `attention.*` is the strip the room raises cards on. They hold it; what is
    // raised ON it for them is decided, as ever, by what their policy can read —
    // they are told when the Food Court fills, and never about an injury.
    actions: ['intent.*', 'assist.*', 'attention.*', 'site.map', 'crowd.gauge', 'attendance.now', 'sales.chart', 'push.compose'],
    data: ['zones.read', 'zone_counts.read', 'sales_hourly.read', 'pushes.read', 'pushes.write.insert', 'agent_turns.read', 'agent_turns.write.insert', 'festival_clock.read', 'attention_labels.read', 'attention_labels.write.insert'],
  },
};
