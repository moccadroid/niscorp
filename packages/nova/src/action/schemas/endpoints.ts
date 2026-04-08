import { z } from 'zod';

export const EndpointConfigSchema = z
  .object({
    url: z.string().describe('Template URL, e.g. "/api/users/{{$.userId}}".'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method.'),
    headers: z.record(z.string(), z.string()).optional().describe('Static request headers.'),
    body: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional()
      .describe('Request body; templates are resolved.'),
    target: z.string().optional().describe('Data path to store the response at on success.'),
    errorTarget: z.string().optional().describe('Data path to store the error at on failure.'),
    transform: z.unknown().optional().describe('Optional Prism-style transform config applied to the response.'),
  })
  .strict()
  .describe('A named HTTP call with template URL, body, and response targeting.');

export type EndpointConfig = z.infer<typeof EndpointConfigSchema>;
