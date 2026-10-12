import type { ActionDefinition } from '@niscorp/nova';
import { dockAction } from './dock.action';
import { explainAction } from './explain.action';
import { charterAction } from './charter.action';
import { catalogAction } from './catalog.action';
import { entriesAction } from './entries.action';
import { surfaceAction } from './surface.action';
import { capabilitiesAction } from './capabilities.action';
import { shellsAction } from './shells.action';
import { timelineAction } from './timeline.action';
import { runsAction } from './runs.action';
import { previewAction } from './preview.action';

export const ADMIN_ACTIONS: Record<string, ActionDefinition> = {
  'admin.dock': dockAction,
  'admin.explain': explainAction,
  'admin.charter': charterAction,
  'admin.catalog': catalogAction,
  'admin.entries': entriesAction,
  'admin.surface': surfaceAction,
  'admin.capabilities': capabilitiesAction,
  'admin.shells': shellsAction,
  'admin.timeline': timelineAction,
  'admin.runs': runsAction,
  'admin.preview': previewAction,
};
