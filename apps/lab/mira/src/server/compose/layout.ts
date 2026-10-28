import { LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import { placesOf, screenLayout } from '../../app/shell/screen.layout';
import type { Place } from '../../app/shell/screen.layout';
import type { Plan, ShownPlan } from './plan';

// Where an answer's layout of the screen canvas goes in the shell's draft: in place of the canvas's own.
export const SCREEN_LAYOUT_REF = 'canvas/screen';

export const placesOfPlan = (plan: Plan): Place[] => placesOf(plan.columns, plan.cards);

export const drawnLayout = (plan: ShownPlan): LayoutNode => LayoutNodeSchema.parse(screenLayout(plan.columns, placesOfPlan(plan), plan.position));
