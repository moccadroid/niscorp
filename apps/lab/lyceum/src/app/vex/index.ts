import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { MEMBER_ENTRIES } from './member.entries';
import { DECK_ENTRIES } from './deck.entries';
import { LOGIN_ENTRIES } from './login.entries';

export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [...MEMBER_ENTRIES, ...DECK_ENTRIES, ...LOGIN_ENTRIES];
