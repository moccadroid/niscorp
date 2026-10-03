import { defineApp } from '@niscorp/moss';
import { actions } from './action-catalog';
import { assignments } from './charter/assignments';
import { charter } from './charter/charter';
import { shell } from './shell/shell';

// The manifest moss serves. One import per field; every field is data
// (AGENTS.md, "Layout of an app"). What it grows next — entries for the data
// layer, behaviors, pages — is in PLAN.md.
export const app = defineApp({ charter, assignments, actions, shell });
