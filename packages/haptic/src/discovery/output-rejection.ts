import { evaluate } from '@niscorp/prism';
import { ErrorCode, SignalError, type StepResult } from '@niscorp/signal';
import { z } from 'zod';
import projection from './output-rejection.json' with { type: 'json' };

export const OutputRejectionsSchema = z.array(
  z
    .object({
      code: z.string().min(1),
      status: z.number().int().min(100).max(599),
      evidence: z.string().min(1),
    })
    .strict(),
);
export type OutputRejections = z.output<typeof OutputRejectionsSchema>;

const providerError = z
  .object({
    code: z.string().nullish(),
    status: z.number().int().nullish(),
    error: z
      .object({
        code: z.string().nullish(),
        status_code: z.number().int().nullish(),
        failed_generation: z.string().optional(),
      })
      .loose()
      .nullish(),
  })
  .loose();

/** Decode provider protocol facts; JSON alone selects their output-rejection meaning. */
export const readOutputRejection = (
  cause: unknown,
  rules: OutputRejections,
): {
  result: StepResult;
  code: string | null;
  status: number | null;
  generation?: string;
} | null => {
  if (!(cause instanceof SignalError) || cause.code !== ErrorCode.PROVIDER_ERROR) return null;
  const decoded = providerError.safeParse(cause.context?.raw);
  if (!decoded.success) return null;
  const raw = decoded.data;
  const error = {
    code: raw.code ?? raw.error?.code ?? null,
    status: raw.status ?? raw.error?.status_code ?? null,
  };
  const evidence = z
    .string()
    .min(1)
    .nullable()
    .parse(evaluate(projection, { input: { error, rules } }));
  if (evidence === null) return null;
  return {
    ...error,
    ...(raw.error?.failed_generation === undefined
      ? {}
      : { generation: raw.error.failed_generation }),
    result: {
      content: '',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
      finishReason: 'error_recovered',
      raw: cause,
      outcome: { kind: 'failed', evidence },
    },
  };
};
