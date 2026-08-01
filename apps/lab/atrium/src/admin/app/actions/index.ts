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

// The tool's whole catalog, named in the vocabulary the stack already has —
// charter, catalog, entries, surface, capabilities, shells. None of them is a
// word invented for a pane; every one is the artifact it is looking at.
//
// `explain` is the exception and earns it: it is not an artifact, it is the
// question the artifacts exist to answer.
//
// The application being administered has never heard of any of these ids: they
// live in this process, in this charter, on this port. Nothing in atrium
// imports this file, and a check asserts it.
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
