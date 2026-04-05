import { z } from 'zod';

import { NodeSchema } from '../schemas/node.schema';
import { ConfigSchema } from '../schemas/config.schema';

export type JsonSchemaTarget = 'draft-2020-12' | 'draft-7' | 'draft-4';

export const getNodeJsonSchema = (target: JsonSchemaTarget = 'draft-2020-12'): object =>
  z.toJSONSchema(NodeSchema, { target });

export const getConfigJsonSchema = (target: JsonSchemaTarget = 'draft-2020-12'): object =>
  z.toJSONSchema(ConfigSchema, { target });
