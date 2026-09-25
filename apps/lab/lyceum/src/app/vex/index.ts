import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { MEMBER_ENTRIES } from './member.entries';

export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [...MEMBER_ENTRIES];
