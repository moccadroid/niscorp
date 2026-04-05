import { z } from 'zod';

import { NodeSchema } from './node.schema';

export const ConfigSchema = NodeSchema.describe(
  'A Prism config: the top-level transformation definition. Can be any valid node.',
);

export type Config = z.infer<typeof ConfigSchema>;
