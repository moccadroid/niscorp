import { z } from 'zod';

const HttpEndpointSchema = z
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
    transform: z
      .unknown()
      .optional()
      .describe('Optional Prism-style transform config applied to the response.'),
  })
  .strict()
  .describe('A named HTTP call with template URL, body, and response targeting.');

const FunctionEndpointSchema = z
  .object({
    fn: z
      .string()
      .describe(
        'Key of a function registered in `ShellConfig.functions`. The host must ' +
          'register the name before the action runs.',
      ),
    target: z.string().optional().describe('Data path to store the return value at on success.'),
    errorTarget: z.string().optional().describe('Data path to store the error at on failure.'),
  })
  .strict()
  .describe('A named local function call. Handler is provided via `ShellConfig.functions`.');

export const EndpointConfigSchema = z
  .union([HttpEndpointSchema, FunctionEndpointSchema])
  .describe('An endpoint — either an HTTP call or a local function.');

export type EndpointConfig = z.infer<typeof EndpointConfigSchema>;
export type HttpEndpointConfig = z.infer<typeof HttpEndpointSchema>;
export type FunctionEndpointConfig = z.infer<typeof FunctionEndpointSchema>;
