import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { contactsList, contactById, contactsByCompany, contactUpsert, contactDelete } from './contacts.entries';
import { companiesList, companyById, companyUpsert, companyDelete } from './companies.entries';
import { dealsList, dealsByOwner, dealById, dealsByCompany, dealsByContact, dealsBoard, dealsOpenByStage, dealsForecast, dealsByStatus, dealsByStage, companyOptions, stageOptions, contactOptions, dealUpsert, dealMoveStage, dealMarkWon, dealMarkLost, dealDelete } from './deals.entries';
import { tasksMine, tasksOverdue, tasksByDeal, tasksByContact, tasksOpenCount, taskUpsert, taskSetDone, taskDelete } from './tasks.entries';
import { activitiesByDeal, activitiesByContact, dealLineItems } from './activities.entries';
import { actionsSearch } from './actions.entries';
import { sidebarCounts } from './counts.entries';

export type CacheEntry = SeedEntry;

export type MutationEntry = SeedMutation;

export const ENTRIES: CacheEntry[] = [
  contactsList,
  contactById,
  contactsByCompany,
  companiesList,
  companyById,
  dealsList,
  dealsByOwner,
  dealById,
  dealsByCompany,
  dealsByContact,
  dealsBoard,
  dealsOpenByStage,
  dealsForecast,
  dealsByStatus,
  dealsByStage,
  companyOptions,
  stageOptions,
  contactOptions,
  tasksMine,
  tasksOverdue,
  tasksByDeal,
  tasksByContact,
  tasksOpenCount,
  activitiesByDeal,
  activitiesByContact,
  dealLineItems,
  actionsSearch,
  sidebarCounts,
];

export const MUTATION_ENTRIES: MutationEntry[] = [
  contactUpsert,
  contactDelete,
  companyUpsert,
  companyDelete,
  taskUpsert,
  taskSetDone,
  taskDelete,
  dealUpsert,
  dealMoveStage,
  dealMarkWon,
  dealMarkLost,
  dealDelete,
];
