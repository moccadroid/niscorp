import { z } from 'zod';
import type { JsonValue, Operation, OperationContext } from './contracts.js';
import { snapshotJson, snapshotObject } from './json.js';
import profile from './default-profile.json' with { type: 'json' };
interface OperationDefinition<Input extends z.ZodType> {
  readonly input: Input;
  readonly output: z.ZodType;
  readonly run: (input: z.output<Input>, context: OperationContext) => unknown | Promise<unknown>;
  readonly maxJsonDepth?: number;
}
/** Native operations own validation, including calls made outside the interpreter. */
export const defineOperation = <Input extends z.ZodType>(
  definition: OperationDefinition<Input>,
): Operation => {
  const parseInput = definition.input.parse.bind(definition.input);
  const validateOutput = definition.output.parse.bind(definition.output);
  const invoke = definition.run;
  const maxJsonDepth = z
    .number()
    .int()
    .positive()
    .parse(definition.maxJsonDepth ?? profile.maxJsonDepth);
  const inputSchema = snapshotObject(
    { ...z.toJSONSchema(definition.input, { io: 'input' }) },
    maxJsonDepth,
  );
  const outputSchema = snapshotObject({ ...z.toJSONSchema(definition.output) }, maxJsonDepth);
  return Object.freeze({
    inputSchema,
    outputSchema,
    async run(input: JsonValue, context: OperationContext): Promise<JsonValue> {
      const signal = context.signal;
      signal.throwIfAborted();
      const request = parseInput(snapshotJson(input, maxJsonDepth));
      const raw = await invoke(request, { signal });
      signal.throwIfAborted();
      const value = snapshotJson(raw, maxJsonDepth);
      // Validation must not replace JSON with a parser clone that drops own keys.
      validateOutput(value);
      return value;
    },
  });
};
