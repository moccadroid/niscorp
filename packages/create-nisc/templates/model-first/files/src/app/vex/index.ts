import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { guidePackages } from './guide.entries';

export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [guidePackages];
