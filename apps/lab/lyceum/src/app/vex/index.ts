import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { MEMBER_ENTRIES } from './member.entries';
import { DECK_ENTRIES } from './deck.entries';

export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [...MEMBER_ENTRIES, ...DECK_ENTRIES];
