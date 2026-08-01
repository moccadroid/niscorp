import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════
// An integration BUNDLE — everything a connector ships beyond its API.
//
// The rule this type enforces by existing: a connector that reports a
// capability commits to the actions that make it usable, guest side and staff
// side. The capability row alone is a promise; the bundle is the delivery.
//
// Everything in here goes over the WIRE, in the service's `/bundle` payload,
// and becomes rows in the app after intake validates the whole thing:
//
//   actions  → bundle_actions rows, merged into the running manifest's action
//              set — shipping one more is a service deploy plus a sync, never
//              a deploy of the app.
//   entries  → bundle_entries rows, then vex_cache (reads and writes the
//              actions replay).
//   slots    → surface_slots rows stamped `source = <connector>` (where the
//              actions surface, per audience, gated by the capability that
//              brought them). The stamp is what lets a re-sync replace one
//              integration's slots and touch nobody else's.
//   options  → request_options rows (menus and priced items, in the
//              connector's own catalogue).
//
// Action ids are namespaced `ext.<audience>.<connector>.<name>`; the charter
// covers each audience with one glob (`ext.guest.*`, …), so a new bundle action
// needs NO charter edit — the ceiling was written once, per audience.
//
// The app-side gate that enforces all of this is server/intake.ts.
// ═══════════════════════════════════════════════════════════

// audience, id, action, title, blurb, icon, capability, stay_state, keywords, canvas, position
//
// `canvas` says which of the shell's canvases the surface belongs on —
// `home` (a guest's composed page), `work` (a pane you work in), or `aside`
// (stay-scoped: it belongs in a guest's workspace, not on the house screen).
// The same class of information as `position`: the shipper describes its
// surface, the shell arranges. An unknown name is refused at intake.
export type SlotRow = [string, string, string, string, string, string, string | null, string, string, string, number];

// capability, label, detail, icon, kind, amount, position
export type OptionRow = [string, string, string, string, string, number, number];

export type IntegrationBundle = {
  connector: string;
  actions: Record<string, ActionDefinition>;
  entries: SeedEntry[];
  mutations: SeedMutation[];
  slots: SlotRow[];
  options: OptionRow[];
  // The bundle's declared table footprint — every mutation it ships must stay
  // inside this list, and the list must name real schema tables. A
  // declaration plus a lint: it exists to make a typo or a collision fail
  // loudly at intake, not to police anyone.
  tables: string[];
};

// The audience is IN the id — `ext.guest.mews.spa` → 'guest'. Derived, never
// stored twice.
export const audienceOfAction = (id: string): string => id.split('.')[1] ?? '';
