import { z } from 'zod';
import { StepSchema } from './effects';

export const LifecycleConfigSchema = z
  .object({
    mount: z.array(StepSchema).optional().describe('Steps to run when the action mounts.'),
    unmount: z.array(StepSchema).optional().describe('Steps to run when the action unmounts.'),
    suspend: z.array(StepSchema).optional().describe('Steps to run when the action is suspended.'),
    resume: z.array(StepSchema).optional().describe('Steps to run when the action resumes.'),
  })
  .strict()
  .describe('Lifecycle hooks for the action runtime state machine.');

export type LifecycleConfig = z.infer<typeof LifecycleConfigSchema>;
