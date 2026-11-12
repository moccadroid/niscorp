import { z } from 'zod';
import { ModelTransportSchema } from './model-transport.js';
import { OutputRejectionsSchema } from './output-rejection.js';

// Discovery's settings. Defaults are the values the pilot ran with; the caps come from its largest measured runs.
export const DiscoveryProfileSchema = z
  .object({
    model: z.string().min(1).default('openai/gpt-oss-120b'),
    efforts: z
      .array(z.enum(['low', 'medium', 'high']))
      .min(1)
      .default(['low', 'high'])
      .describe(
        'One attempt per effort, in order; the next runs only when an attempt stops or has a finding other than the count.',
      ),
    temperature: z.number().default(1),
    topP: z.number().default(1),
    maxOutputTokens: z.number().int().positive().default(16_384),
    maxRequestBytes: z.number().int().positive().default(524_288),
    agentTimeoutMs: z.number().int().positive().default(180_000),
    discoveryTimeoutMs: z
      .number()
      .int()
      .positive()
      .default(13 * 60_000),
    readSteps: z.number().int().positive().default(3),
    fieldSteps: z.number().int().positive().default(3),
    mappingSteps: z.number().int().positive().default(4),
    maxInputTokens: z
      .number()
      .int()
      .positive()
      .default(400_000)
      .describe('Per discovery, all attempts; when reached no new model call starts.'),
    maxJevCalls: z
      .number()
      .int()
      .positive()
      .default(250)
      .describe('Per attempt; records past it are not labelled and get no where test.'),
    jevConcurrency: z.number().int().positive().default(6),
    readBudgetChars: z
      .number()
      .int()
      .positive()
      .default(64 * 1024)
      .describe('Above this size of text view, Read sees one section of the page.'),
    mappingSampleBytes: z
      .number()
      .int()
      .positive()
      .default(16 * 1024),
    fieldRecordChars: z.number().int().positive().default(6000),
    maxPages: z
      .number()
      .int()
      .positive()
      .default(21)
      .describe('Pages one run of the artifact may read, the first included.'),
    maxRedirects: z.number().int().nonnegative().default(3),
    transport: ModelTransportSchema.default({
      openaiCompatible: { maxRetries: 5 },
      rateLimit: {
        statuses: [429],
        fallbackWaitMs: 1000,
        code: 'PROVIDER_RATE_LIMITED',
        message:
          'The model provider remained rate-limited after the configured transport retries. Discovery is blocked, not semantically rejected.',
      },
    }),
    outputRejections: OutputRejectionsSchema.default([
      {
        code: 'output_parse_failed',
        status: 400,
        evidence:
          'The provider rejected the generated output before a usable answer was delivered. Return a fresh answer using the supplied output schema and finish protocol.',
      },
    ]),
  })
  .strict();
export type DiscoveryProfile = z.output<typeof DiscoveryProfileSchema>;
export type DiscoveryProfileInput = z.input<typeof DiscoveryProfileSchema>;
export type Effort = DiscoveryProfile['efforts'][number];
