import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// audience, id, action, title, blurb, icon, capability, stay_state, keywords, canvas, position
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
  // Every table the bundle's mutations write: intake refuses a mutation outside
  // this list, and a name that is not a schema table.
  tables: string[];
};

export const audienceOfAction = (id: string): string => id.split('.')[1] ?? '';
