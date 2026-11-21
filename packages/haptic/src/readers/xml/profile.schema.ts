import { z } from 'zod';
import defaults from './default-profile.json' with { type: 'json' };
import { freezeOwned } from '../../engine/json.js';

export const XmlProfileSchema = z
  .object({
    maxInputBytes: z.number().int().positive(),
    maxNodes: z.number().int().positive(),
    maxDepth: z.number().int().positive(),
    maxSelectedItems: z.number().int().positive(),
    maxFieldValues: z.number().int().positive(),
    maxFieldBytes: z.number().int().positive(),
  })
  .strict();
export type XmlProfile = z.infer<typeof XmlProfileSchema>;
export const readXmlProfile = (input?: unknown): XmlProfile =>
  freezeOwned(XmlProfileSchema.parse(input ?? defaults));
