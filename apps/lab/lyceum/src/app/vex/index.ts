import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { MEMBER_ENTRIES } from './member.entries';
import { DECK_ENTRIES } from './deck.entries';
import { LOGIN_ENTRIES } from './login.entries';
import { QUERY_ENTRIES } from './query.entries';
import { TIMER_ENTRIES } from './timer.entries';
import { ASSISTANT_ENTRIES } from './assistant.entries';
import { RENDERER_ENTRIES } from './renderer.entries';
import { QUESTION_ENTRIES } from './question.entries';

export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [...MEMBER_ENTRIES, ...DECK_ENTRIES, ...LOGIN_ENTRIES, ...QUERY_ENTRIES, ...TIMER_ENTRIES, ...ASSISTANT_ENTRIES, ...RENDERER_ENTRIES, ...QUESTION_ENTRIES];
