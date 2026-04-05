import type { z } from 'zod';
import type { Tool, ToolConfig } from '../types';

export const defineTool = <TInput>(config: ToolConfig<TInput>): Tool => ({
  name: config.name,
  description: config.description,
  inputSchema: config.input as z.ZodType,
  execute: config.execute as (input: unknown) => Promise<unknown> | unknown,
});
