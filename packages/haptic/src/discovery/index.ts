import { z } from 'zod';
import { freezeOwned, snapshotObject } from '../engine/json.js';
import type { Operations } from '../engine/contracts.js';
import { ArtifactSchema, type Artifact, LimitsSchema } from '../engine/schema.js';
import { defineOperation } from '../engine/operation.js';
import { createWebOperations, WebProfileSchema, type WebProfile } from '../operations/web.js';
import { validateLocator } from '../readers/html/index.js';
import { createHtmlInspectionOperations } from './html-inspection.js';
import { createHtmlContextOperation, HtmlContextPolicySchema } from './html-context.js';
import { createJsonEncodingOperation, createReviewOperation } from './review.js';
import resultReviewFlow from './result-review.json' with { type: 'json' };
import { createResultContractOperation } from './result-contract.js';
import { createTaskDeclarationOperation } from './task-declaration.js';
import { createSourceAuthorOperations, createTextBytesOperation } from './source-author.js';
import { createHtmlViewOperation, InitialHtmlViewSchema } from './html-view.js';
import {
  ResultFlowsSchema,
  ResourcePolicySchema,
  FormatsSchema,
  TraversalPolicySchema,
} from './result.schema.js';
import {
  DiscoverySettingsSchema,
  createModelOperationOptions,
  type DiscoveryRecord,
} from './model.js';
import { HtmlDiagnosticPolicySchema } from './html-match-diagnostics.js';
import { AuthoringPolicySchema, createHtmlMeasureOperation } from './html-measure.js';
import { createTrialOperation, createPrepareOperation } from './trial.js';
import workflow from './discovery.json' with { type: 'json' };
import bindings from './discovery-binding.json' with { type: 'json' };
import acquisition from './discovery-acquisition.json' with { type: 'json' };
import sources from './discovery-source.json' with { type: 'json' };
import output from './discovery-output.json' with { type: 'json' };
import models from './discovery-model.json' with { type: 'json' };
import capturedTrial from './captured-trial.json' with { type: 'json' };
import groundedResources from './grounded-resources.json' with { type: 'json' };
import defaults from './default-profile.json' with { type: 'json' };
import { OutputRejectionsSchema } from './output-rejection.js';
import { createModelClient, ModelTransportSchema } from './model-transport.js';
export { ProviderBlockSchema } from './model-transport.js';
export type { ProviderBlock } from './model-transport.js';
import htmlEvidence from './html-evidence.json' with { type: 'json' };
import { blueprint, builderContracts, discoveryOutputSchema } from './blueprint.js';

export const discoveryWorkflow: Artifact = freezeOwned(
  ArtifactSchema.parse({
    ...workflow,
    flow: { ...workflow.flow, outputSchema: discoveryOutputSchema },
    flows: [
      ...workflow.flows,
      ...bindings.flows,
      ...acquisition.flows,
      ...sources.flows,
      ...output.flows,
      ...models.flows,
      ...capturedTrial.flows,
      ...groundedResources.flows,
      { id: 'result-review', revision: 1, flow: resultReviewFlow.flow },
      ...resultReviewFlow.flows,
      ...htmlEvidence.flows,
      ...blueprint.jsonFlows,
      ...blueprint.xmlFlows,
      ...blueprint.flows,
    ].map((entry) => ({
      ...entry,
      flow: { ...entry.flow, ...builderContracts[entry.id] },
    })),
  }),
);
export { TaskDeclarationSchema } from './task-declaration.js';
export { ReviewVerdictSchema } from './review.schema.js';
export { ResultSchemaBodySchema } from './result-contract.js';
export { HtmlAuthorOutputSchema } from './rules.schema.js';
export { HtmlSelectionRulesSchema } from './rules.schema.js';
export type { DiscoveryRecord } from './model.js';
export {
  createHtmlContextOperation,
  HtmlContextPolicySchema,
  HtmlContextOutputSchema,
} from './html-context.js';

export const DiscoveryProfileSchema = z
  .object({
    provider: z.union([
      z.string().min(1),
      z
        .object({
          adapter: z.enum(['openai-compatible', 'anthropic', 'google']),
          baseUrl: z.url(),
          wire: z.array(z.string()).optional(),
        })
        .strict(),
    ]),
    settings: DiscoverySettingsSchema,
    outputSettings: DiscoverySettingsSchema.partial().optional(),
    modelTransport: ModelTransportSchema,
    outputRejections: OutputRejectionsSchema,
    author: z
      .object({
        maxModelSteps: z.number().int().positive(),
        maxResponseAttempts: z.number().int().positive(),
        maxModelMs: z.number().int().positive(),
      })
      .strict(),
    observations: z
      .object({
        maxBytes: z.number().int().positive(),
        useScopedHtml: z.boolean(),
        skipRepeated: z.boolean(),
      })
      .strict(),
    maxInputBytes: z.number().int().positive(),
    formats: FormatsSchema,
    htmlContext: z
      .object({
        enabled: z.boolean(),
        maxInlineBytes: z.number().int().positive(),
        initialInspection: InitialHtmlViewSchema,
        policy: HtmlContextPolicySchema,
      })
      .strict(),
    diagnostics: HtmlDiagnosticPolicySchema.nullable(),
    authoring: AuthoringPolicySchema,
    review: z
      .object({
        maxModelSteps: z.number().int().positive(),
        maxModelMs: z.number().int().positive(),
        maxRepairs: z.number().int().nonnegative(),
      })
      .strict(),
    resultFlows: ResultFlowsSchema,
    resources: ResourcePolicySchema,
    minimumResultMatches: z.number().int().nonnegative(),
    traversal: TraversalPolicySchema,
    engine: LimitsSchema,
    trial: LimitsSchema,
  })
  .strict();

export const discoveryProfile = freezeOwned(DiscoveryProfileSchema.parse(defaults));

const ownMechanicalOperations = (operations: Operations, maxJsonDepth: number): Operations =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(operations).map(([name, operation]) => [
        name,
        Object.freeze({
          inputSchema: snapshotObject(operation.inputSchema, maxJsonDepth),
          outputSchema: snapshotObject(operation.outputSchema, maxJsonDepth),
          run: operation.run.bind(operation),
        }),
      ]),
    ),
  );

/** Credentials remain host-owned. The JSON workflow reads the supplied profile. */
export const createDiscoveryOperations = (input: {
  author: { apiKey: string };
  profile?: unknown;
  web?: WebProfile;
  mechanical?: Operations;
  record?: DiscoveryRecord;
}): { operations: Operations; limits: z.output<typeof LimitsSchema>; close(): void } => {
  const credentials = z
    .object({ apiKey: z.string().min(1) })
    .strict()
    .parse(input.author);
  const profile = freezeOwned(DiscoveryProfileSchema.parse(input.profile ?? defaults));
  validateLocator(profile.htmlContext.initialInspection.selector);
  for (const selector of profile.htmlContext.policy.clearContentsOf ?? [])
    validateLocator(selector);
  if (
    profile.resultFlows.some(
      (entry) =>
        !blueprint.resultFlows.some(
          (flow) => flow.id === entry.flow.id && flow.revision === entry.flow.revision,
        ),
    )
  )
    throw new Error('RESULT_FLOW_UNAVAILABLE: profile references an unsupported result flow');
  const webProfile = WebProfileSchema.parse({
    ...input.web,
    maxJsonDepth: profile.engine.maxJsonDepth,
  });
  const overrides = ownMechanicalOperations(input.mechanical ?? {}, profile.engine.maxJsonDepth);
  const web = createWebOperations(webProfile);
  const mechanical = Object.freeze({ ...web.operations, ...overrides });
  const transport = createModelClient({
    provider: profile.provider,
    apiKey: credentials.apiKey,
    transport: profile.modelTransport,
  });
  const modelOptions = createModelOperationOptions({
    client: transport.client,
    providerBlockFor: transport.blockFor,
    profile,
    record: input.record,
  });
  const trial = createTrialOperation(mechanical, profile.trial, input.record);
  return {
    operations: {
      ...mechanical,
      ...createHtmlInspectionOperations(webProfile.html, profile.engine.maxJsonDepth),
      'html.prepareContext': createHtmlContextOperation({
        html: webProfile.html,
        maxJsonDepth: profile.engine.maxJsonDepth,
      }),
      'discovery.profile': defineOperation({
        maxJsonDepth: profile.engine.maxJsonDepth,
        input: z.null(),
        output: DiscoveryProfileSchema,
        run: () => profile,
      }),
      'discovery.blueprint': defineOperation({
        maxJsonDepth: profile.engine.maxJsonDepth,
        input: z.null(),
        output: z.json(),
        run: () => blueprint,
      }),
      'html.measure': createHtmlMeasureOperation({
        html: webProfile.html,
        maxJsonDepth: profile.engine.maxJsonDepth,
      }),
      ...createSourceAuthorOperations(modelOptions),
      'text.bytes': createTextBytesOperation(profile.engine.maxJsonDepth),
      'html.view': createHtmlViewOperation({
        html: webProfile.html,
        maxJsonDepth: profile.engine.maxJsonDepth,
      }),
      'task.declare': createTaskDeclarationOperation(modelOptions),
      'result.review': createReviewOperation(modelOptions),
      'json.encode': createJsonEncodingOperation(profile.engine.maxJsonDepth),
      'result.contract': createResultContractOperation(modelOptions),
      'artifact.prepare': createPrepareOperation(mechanical, profile.engine),
      'artifact.trial': trial,
    },
    limits: profile.engine,
    close: web.close,
  };
};
