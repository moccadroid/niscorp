import { defineApp } from '@niscorp/moss';
import { actions } from './action-catalog';
import { assignments } from './charter/assignments';
import { charter } from './charter/charter';
import { shell } from './shell/shell';

export const app = defineApp({ charter, assignments, actions, shell });
