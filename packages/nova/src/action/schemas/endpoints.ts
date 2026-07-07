import { z } from 'zod';

const HttpEndpointSchema = z
  .object({
    url: z.string().describe('Template URL, e.g. "/api/users/{{$.userId}}".'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method.'),
    headers: z.record(z.string(), z.string()).optional().describe('Static request headers.'),
    request: z
      .unknown()
      .optional()
      .describe(
        'Transform config run by the injected evaluator over the action data to build the ' +
          "request body. Static parts are literal; dynamic parts use the evaluator's ops. " +
          'Requires an injected transform.',
      ),
    response: z
      .unknown()
      .optional()
      .describe(
        'Transform config run by the injected evaluator over the reply as received ' +
          '(`$` is the reply — object, array, or scalar) to produce the value stored at `target`. ' +
          'Requires an injected transform.',
      ),
    target: z.string().optional().describe('Data path to store the result at on success.'),
    errorTarget: z.string().optional().describe('Data path to store the error at on failure.'),
  })
  .strict()
  .describe('A named HTTP call. `request`/`response` shape the body/reply via the injected transform.');

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
