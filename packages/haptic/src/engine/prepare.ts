import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import formats from 'ajv-formats';
import { compile, execute, type CompiledIr } from '@niscorp/prism';
import type { JsonObject, JsonValue, Operations, Outcome } from './contracts.js';
import {
  ArtifactSchema,
  LimitsSchema,
  type Artifact,
  type Flow,
  type Step,
  type Limits,
  type LimitsInput,
} from './schema.js';
import { ArtifactError } from './errors.js';
import { snapshotJson, snapshotObject, freezeOwned } from './json.js';
import { assertSupportedSchema } from './schema-admission.js';
import { upgradeArtifact } from './versioning.js';
import { createControl, OperationFailure, type Control } from './control.js';
type Boundary = (value: JsonValue) => void;
type Expression = (source: JsonObject) => JsonValue;
type PreparedOperation = (input: JsonValue, signal: AbortSignal) => Promise<JsonValue>;
type Call =
  | {
      operation: PreparedOperation;
    }
  | {
      flow: string;
    };
interface PreparedStep {
  id: string;
  call: Call | null;
  input: Expression;
  when?: Expression;
  each?: {
    items: Expression;
    onFailure: 'stop' | 'record';
  };
  checks: {
    id: Expression;
    test: Expression;
  }[];
  output?: Expression;
}
interface PreparedFlow {
  data: JsonObject;
  input: Boundary;
  output: Expression;
  validateOutput: Boundary;
  steps: PreparedStep[];
}
export interface PreparedArtifact {
  run(
    input: unknown,
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<Outcome>;
}
const keyOf = (id: string, revision: number): string => JSON.stringify([id, revision]);
const completed = (value: JsonValue): Outcome => ({ status: 'completed', value, error: null });
const failed = (error: OperationFailure): Outcome => ({
  status: 'failed',
  value: null,
  error: { code: error.code, message: error.message },
});
// Validate without replacing the supplied JSON with a schema library's clone.
// In particular, JSON Schema property names must survive unchanged.
function assertArtifact(value: unknown): asserts value is Artifact {
  const parsed = ArtifactSchema.safeParse(value);
  if (!parsed.success)
    throw new ArtifactError('INVALID_FLOW', 'Invalid artifact: ' + parsed.error.message, '$');
}
const readArtifact = (value: unknown, maxJsonDepth: number): Artifact => {
  const object = snapshotObject(value, maxJsonDepth),
    normalized = {
      ...object,
      data: object.data === undefined ? {} : object.data,
      flows: object.flows === undefined ? [] : object.flows,
    };
  assertArtifact(normalized);
  return freezeOwned(normalized);
};
const schemaCompiler = (): ((schema: JsonObject) => Boundary) => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    ownProperties: true,
    addUsedSchema: false,
  });
  formats.default(ajv);
  return (schema) => {
    assertSupportedSchema(schema);
    let validate: ValidateFunction;
    try {
      validate = ajv.compile(schema);
    } catch (cause) {
      throw new ArtifactError('INVALID_SCHEMA', 'Invalid boundary schema', '$', { cause });
    }
    return (value) => {
      if (!validate(value))
        throw new ArtifactError('INVALID_VALUE', ajv.errorsText(validate.errors), '$');
    };
  };
};
const assertExpression = (config: unknown, path = '$'): void => {
  if (config === null || typeof config !== 'object') return;
  for (const [key, value] of Object.entries(config)) {
    const childPath = path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
    if (key === '__proto__') {
      throw new ArtifactError(
        'INVALID_EXPRESSION',
        'Prism 0.3.1 cannot preserve this own configuration key',
        childPath,
      );
    }
    assertExpression(value, childPath);
  }
};
const expression = async (config: unknown, limits: Limits['prism']): Promise<Expression> => {
  assertExpression(config);
  const ir: CompiledIr = await compile(config);
  return (source) => execute(ir, source, limits);
};
const prepareStep = async (
  step: Step,
  operations: Map<string, PreparedOperation>,
  flows: Set<string>,
  limits: Limits['prism'],
): Promise<PreparedStep> => {
  let call: Call | null = null;
  if ('call' in step && 'operation' in step.call) {
    const operation = operations.get(step.call.operation);
    if (!operation)
      throw new ArtifactError(
        'INVALID_FLOW',
        'Unavailable operation: ' + step.call.operation,
        step.id,
      );
    call = { operation };
  } else if ('call' in step && 'flow' in step.call) {
    const key = keyOf(step.call.flow.id, step.call.flow.revision);
    if (!flows.has(key))
      throw new ArtifactError('INVALID_FLOW', 'Unavailable helper: ' + key, step.id);
    call = { flow: key };
  }
  return {
    id: step.id,
    call,
    input: await expression('value' in step ? step.value : step.input, limits),
    ...(step.when === undefined ? {} : { when: await expression(step.when, limits) }),
    ...(step.each === undefined
      ? {}
      : {
          each: {
            items: await expression(step.each.items, limits),
            onFailure: step.each.onFailure,
          },
        }),
    checks: await Promise.all(
      (step.checks ?? []).map(async (check) => ({
        id: typeof check.id === 'string' ? () => check.id : await expression(check.id, limits),
        test: await expression(check.test, limits),
      })),
    ),
    ...(step.output === undefined ? {} : { output: await expression(step.output, limits) }),
  };
};
const prepareFlow = async (
  flow: Flow,
  boundary: (schema: JsonObject) => Boundary,
  operations: Map<string, PreparedOperation>,
  flows: Set<string>,
  limits: Limits['prism'],
  data: JsonObject,
): Promise<PreparedFlow> => {
  if (new Set(flow.steps.map((step) => step.id)).size !== flow.steps.length) {
    throw new ArtifactError('INVALID_FLOW', 'Duplicate step id', '$');
  }
  return {
    data,
    input: boundary(flow.inputSchema),
    validateOutput: boundary(flow.outputSchema),
    output: await expression(flow.output, limits),
    steps: await Promise.all(
      flow.steps.map((step) => prepareStep(step, operations, flows, limits)),
    ),
  };
};
const boolean = (value: JsonValue): boolean => {
  if (typeof value !== 'boolean')
    throw new ArtifactError('INVALID_VALUE', 'Condition/check must return a boolean', '$');
  return value;
};
const checkId = (value: JsonValue): string => {
  if (typeof value !== 'string' || value.length === 0)
    throw new ArtifactError('INVALID_VALUE', 'Check name must return a nonempty string', '$');
  return value;
};
const executeFlow = async (
  flow: PreparedFlow,
  input: JsonValue,
  helpers: Map<string, PreparedFlow>,
  control: Control,
  depth: number,
): Promise<JsonValue> => {
  control.depth(depth);
  flow.input(input);
  const steps: JsonObject = Object.create(null);
  const source: JsonObject = {
    data: flow.data,
    input,
    steps,
    item: null,
    index: null,
    value: null,
  };
  for (const step of flow.steps) {
    let outcome: Outcome;
    if (step.each) {
      control.step();
      const items = step.each.items(source);
      if (!Array.isArray(items))
        throw new ArtifactError('INVALID_VALUE', 'each.items must return an array', step.id);
      control.items(items.length);
      const outcomes: JsonValue[] = [];
      for (const [index, item] of items.entries()) {
        const scope: JsonObject = { ...source, item, index };
        outcomes.push(
          await executeStep(step, scope, helpers, control, depth, step.each.onFailure === 'record'),
        );
      }
      outcome = completed(outcomes);
    } else {
      outcome = await executeStep(step, source, helpers, control, depth, false);
    }
    steps[step.id] = outcome;
  }
  control.check();
  const result = flow.output(source);
  flow.validateOutput(result);
  return result;
};
const executeStep = async (
  step: PreparedStep,
  source: JsonObject,
  helpers: Map<string, PreparedFlow>,
  control: Control,
  depth: number,
  record: boolean,
): Promise<Outcome> => {
  control.step();
  if (step.when && !boolean(step.when(source)))
    return { status: 'skipped', value: null, error: null };
  try {
    const input = step.input(source);
    let value = input;
    if (step.call && 'operation' in step.call) {
      const operation = step.call.operation;
      value = await control.wait(() => operation(input, control.signal));
    } else if (step.call) {
      const helper = helpers.get(step.call.flow);
      if (!helper) throw new ArtifactError('INVALID_FLOW', 'Prepared helper missing', step.id);
      value = await executeFlow(helper, input, helpers, control, depth + 1);
    }
    const outputSource: JsonObject = { ...source, value };
    for (const check of step.checks) {
      if (!boolean(check.test(outputSource)))
        throw new OperationFailure(
          'CHECK_FAILED',
          'Check failed: ' + checkId(check.id(outputSource)),
        );
    }
    control.check();
    return completed(step.output ? step.output(outputSource) : value);
  } catch (error) {
    if (record && error instanceof OperationFailure) return failed(error);
    throw error;
  }
};
export const prepareArtifact = async (
  document: unknown,
  registry: Operations,
  inputLimits: LimitsInput = {},
): Promise<PreparedArtifact> => {
  const limits = LimitsSchema.parse(inputLimits);
  const supplied = snapshotObject(document, limits.maxJsonDepth);
  const stamp = ArtifactSchema.shape.stamp.parse(supplied.stamp);
  const boundary = schemaCompiler(),
    operations = new Map<string, PreparedOperation>();
  for (const [name, operation] of Object.entries(registry)) {
    const run = operation.run.bind(operation);
    operations.set(name, (input, signal) => run(input, { signal }));
  }
  const artifact = readArtifact(await upgradeArtifact(supplied, stamp), limits.maxJsonDepth);
  const helperKeys = artifact.flows.map((flow) => keyOf(flow.id, flow.revision));
  if (new Set(helperKeys).size !== helperKeys.length)
    throw new ArtifactError('INVALID_FLOW', 'Duplicate helper revision', '$');
  const keys = new Set(helperKeys),
    helpers = new Map<string, PreparedFlow>();
  for (const helper of artifact.flows)
    helpers.set(
      keyOf(helper.id, helper.revision),
      await prepareFlow(helper.flow, boundary, operations, keys, limits.prism, artifact.data),
    );
  const root = await prepareFlow(
    artifact.flow,
    boundary,
    operations,
    keys,
    limits.prism,
    artifact.data,
  );
  return {
    async run(input, options = {}): Promise<Outcome> {
      const control = createControl(limits, options.signal);
      try {
        const ownedInput = snapshotJson(input, limits.maxJsonDepth);
        const value = await executeFlow(root, ownedInput, helpers, control, 1);
        control.check();
        const result = completed(snapshotJson(value, limits.maxJsonDepth));
        control.check();
        return result;
      } catch (error) {
        control.check();
        if (error instanceof OperationFailure) return failed(error);
        throw error;
      } finally {
        control.close();
      }
    },
  };
};
