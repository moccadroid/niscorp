import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { greetingAdd, greetingLanguages, greetingsCount, greetingsInLanguage, greetingsList, greetingsPerLanguage } from './greetings.entries';

export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [greetingsList, greetingsInLanguage, greetingsCount, greetingsPerLanguage, greetingLanguages, greetingAdd];
