import type { IntegrationBundle } from './types';
import { MEWS_BUNDLE } from './mews/bundle';
import { OPERA_BUNDLE } from './opera/bundle';

export const BUNDLES: IntegrationBundle[] = [MEWS_BUNDLE, OPERA_BUNDLE];

export type { IntegrationBundle } from './types';
export { audienceOfAction } from './types';
