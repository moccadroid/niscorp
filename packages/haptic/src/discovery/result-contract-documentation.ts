import { z } from 'zod';

export const ResultContractDocumentationSchema = z
  .object({
    heading: z.string().min(1),
    introduction: z.string().min(1),
    node: z.string().min(1),
    field: z.string().min(1),
  })
  .strict();

export type ResultContractDocumentation = z.infer<typeof ResultContractDocumentationSchema>;
