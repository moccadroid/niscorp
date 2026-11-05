import { z } from 'zod';
import { ArtifactSchema, FlowSchema, engineProfile } from '../engine/schema.js';
import { freezeOwned, snapshotObject } from '../engine/json.js';
import type { JsonObject } from '../engine/contracts.js';
import { XmlSelectionSchema } from '../operations/xml.js';
import { HttpSourceSchema } from '../operations/http-source.js';
import { AuthoringPolicySchema, HtmlMeasureOutputSchema } from './html-measure.js';
import { HtmlAuthorOutputSchema, TaskDeclarationSchema, StageRuleSchema } from './rules.schema.js';
import { SourceEvidenceSchema } from './review.schema.js';
import {
  DiscoveryResultSchema,
  ModelAllowanceSchema,
  ReviewSummarySchema,
} from './discovery-result.schema.js';
import {
  DiscoveryReasonSchema,
  ModelErrorSchema,
  ModelMetaSchema,
  ModelSourcesSchema,
} from './model-result.schema.js';
import {
  AuthorMessageSchema,
  AuthorJobSchema,
  AuthorHistoriesSchema,
} from './author-history.schema.js';
import {
  phaseContracts,
  mechanicalPhaseContracts,
  SourceFeedbackSchema,
} from './phase-contracts.schema.js';
import { DiscoverySettingsSchema } from './model.js';
import {
  FormatsSchema,
  ResultFlowSchema,
  ResultFlowsSchema,
  ResourcePolicySchema,
  TraversalPolicySchema,
} from './result.schema.js';
import template from './mechanical.json' with { type: 'json' };
import { CapturedTrialInputSchema, CapturedTrialOutputSchema } from './captured-trial.schema.js';
import { HtmlSourceFieldsSchema, HtmlSourceInspectionSchema } from './source-author.js';
import { HtmlViewInputSchema, HtmlViewOutputSchema, InitialHtmlViewSchema } from './html-view.js';
import { HtmlFieldsSchema } from '../readers/html/index.js';
import {
  HtmlReferencesInputSchema,
  HtmlReferenceRecordSchema,
  ResolveReferenceValuesInputSchema,
  ResolvedReferenceValuesSchema,
} from './references.schema.js';

const rules = z.array(StageRuleSchema);
const taskInput = z
  .object({
    task: TaskDeclarationSchema,
    rules,
    allowResourceFetching: z.boolean(),
  })
  .strict();
const executionData = {
  rules,
  task: TaskDeclarationSchema,
  policy: TraversalPolicySchema,
  canFollow: z.boolean(),
  minimumResultMatches: z.number().int().nonnegative(),
  seen: z.array(z.string()),
  resources: ResourcePolicySchema,
  formats: FormatsSchema,
  resultFlow: ResultFlowSchema.nullable(),
  mode: z.enum(['stage', 'walk']),
};
const sourceInput = z.object({ url: z.url(), source: HttpSourceSchema }).strict();
const documentInput = z
  .object({
    url: z.url(),
    policy: TraversalPolicySchema,
    formats: FormatsSchema,
  })
  .strict();
const namedFlow = z
  .object({ id: z.string().min(1), revision: z.number().int().positive(), flow: FlowSchema })
  .strict();
const schemaObject = z.record(z.string(), z.json());
const blueprintSchema = z
  .object({
    stamp: z.record(z.string(), z.number().int().nonnegative()),
    flows: z.array(namedFlow),
    resultFlows: z.array(ResultFlowSchema),
    jsonFlows: z.array(namedFlow),
    xmlFlows: z.array(namedFlow),
    referenceSchema: schemaObject,
    referenceFlow: FlowSchema,
    execution: z
      .object({
        document: FlowSchema,
        shaped: FlowSchema,
        page: FlowSchema,
        sourceInputSchema: schemaObject,
      })
      .strict(),
  })
  .strict();

const jsonSchema = (schema: z.ZodType): JsonObject =>
  snapshotObject({ ...z.toJSONSchema(schema, { reused: 'ref' }) }, engineProfile.maxJsonDepth);

// Contracts are attached once when composing JSON documents. No policy is executed here.
const mechanicalInputs: Record<string, z.ZodType> = {
  ...Object.fromEntries(
    Object.entries(mechanicalPhaseContracts).map(([id, contract]) => [id, contract.input]),
  ),
  'task-result': z.union([taskInput, taskInput.extend(executionData)]),
  'precondition-admission': z.object({ rules }).strict(),
  'html-references': HtmlReferencesInputSchema,
  'resolve-reference-values': ResolveReferenceValuesInputSchema,
};
const inputSchemas = Object.fromEntries(
  Object.entries(mechanicalInputs).map(([id, schema]) => [id, jsonSchema(schema)]),
);
const outputSchemas = Object.fromEntries(
  Object.entries({
    ...Object.fromEntries(
      Object.entries(mechanicalPhaseContracts).map(([id, contract]) => [id, contract.output]),
    ),
    'task-result': z.object({ accepted: z.boolean(), task: TaskDeclarationSchema }).strict(),
    'html-references': HtmlReferenceRecordSchema,
    'resolve-reference-values': ResolvedReferenceValuesSchema,
  }).map(([id, schema]) => [id, jsonSchema(schema)]),
);
export const blueprint: z.output<typeof blueprintSchema> = freezeOwned(
  blueprintSchema.parse({
    ...template,
    execution: { ...template.execution, sourceInputSchema: jsonSchema(sourceInput) },
    flows: template.flows.map((entry) => ({
      ...entry,
      flow: {
        ...entry.flow,
        inputSchema: inputSchemas[entry.id] ?? entry.flow.inputSchema,
        outputSchema: outputSchemas[entry.id] ?? entry.flow.outputSchema,
      },
    })),
    jsonFlows: template.jsonFlows.map((entry) => ({
      ...entry,
      flow: {
        ...entry.flow,
        inputSchema: inputSchemas[entry.id] ?? entry.flow.inputSchema,
        outputSchema: outputSchemas[entry.id] ?? entry.flow.outputSchema,
      },
    })),
    xmlFlows: template.xmlFlows.map((entry) => ({
      ...entry,
      flow: {
        ...entry.flow,
        inputSchema: inputSchemas[entry.id] ?? entry.flow.inputSchema,
        outputSchema: outputSchemas[entry.id] ?? entry.flow.outputSchema,
      },
    })),
  }),
);

const bindCommon = z
  .object({
    blueprint: blueprintSchema,
    mode: z.enum(['stage', 'walk']),
    rule: StageRuleSchema.nullable().optional(),
    stages: rules.optional(),
    task: TaskDeclarationSchema,
    policy: TraversalPolicySchema,
    canFollow: z.boolean().optional(),
    minimumResultMatches: z.number().int().nonnegative(),
    seen: z.array(z.string()).optional(),
    resources: ResourcePolicySchema,
    formats: FormatsSchema,
  })
  .strict();
const bindInput = z.discriminatedUnion('mode', [
  bindCommon.extend({ mode: z.literal('stage'), rule: StageRuleSchema }),
  bindCommon.extend({ mode: z.literal('walk'), stages: rules }),
]);
const bindDocumentInput = z
  .object({
    blueprint: blueprintSchema,
    readFlow: ResultFlowSchema,
    readInput: z.union([
      documentInput.omit({ url: true }),
      documentInput.omit({ url: true }).extend({ rule: XmlSelectionSchema }),
    ]),
    runtimeFlows: z.array(namedFlow),
  })
  .strict();
const bindOutputInput = z
  .object({
    artifact: ArtifactSchema,
    shapedFlow: FlowSchema,
    sourceFlow: ResultFlowSchema,
    mapping: z.json(),
    outputSchema: schemaObject,
  })
  .strict();
// These internal contexts retain fields consumed by delegated flows as well.
const initialHtmlInspection = InitialHtmlViewSchema;
const modelProfile = z
  .object({
    settings: DiscoverySettingsSchema,
    maxInputBytes: z.number().int().positive(),
    observations: z.object({ maxBytes: z.number().int().positive() }).loose(),
    htmlContext: z
      .object({
        maxInlineBytes: z.number().int().positive(),
        initialInspection: initialHtmlInspection,
      })
      .loose(),
    authoring: AuthoringPolicySchema,
    responseAttempts: z.number().int().positive().optional(),
  })
  .loose();
const htmlAdmission = z
  .object({
    rules: HtmlAuthorOutputSchema,
    facts: HtmlMeasureOutputSchema,
    context: z
      .object({
        task: TaskDeclarationSchema,
        canFetch: z.boolean(),
        canFollow: z.boolean(),
        authoring: AuthoringPolicySchema,
        minimumResultMatches: z.number().int().nonnegative(),
        resultFlows: ResultFlowsSchema,
      })
      .loose(),
  })
  .strict();
const reviewInput = z
  .object({
    url: z.url(),
    instruction: z.string().min(1),
    resultDataSchema: schemaObject,
    dataToReview: z.json(),
    sourceEvidence: z.array(SourceEvidenceSchema).min(1),
    context: z
      .object({
        limits: TraversalPolicySchema,
        resources: ResourcePolicySchema,
        visited: z.array(z.url()),
        limited: z.boolean(),
        resourceUrls: z.array(HttpSourceSchema.shape.url),
        resourceRedirects: z.array(
          z
            .object({
              url: HttpSourceSchema.shape.url,
              status: HttpSourceSchema.shape.status,
              location: z.array(z.string()),
            })
            .strict(),
        ),
        schemaOrigin: z.enum(['caller', 'generated']).optional(),
      })
      .strict(),
    profile: modelProfile,
    asOf: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

const authorMessage = AuthorMessageSchema;
const authorJob = AuthorJobSchema;
const authorHistoryInput = {
  histories: AuthorHistoriesSchema,
  repairFeedback: z.json().nullable(),
  repairCount: z.number().int().nonnegative(),
};
const reviewResult = ReviewSummarySchema.extend({ rawSources: ModelSourcesSchema });

const htmlViewMetadata = z.union([
  z.object({ completeDocument: z.literal(true) }).strict(),
  HtmlViewOutputSchema.extend({
    completeDocument: z.literal(false),
    items: z.array(HtmlViewOutputSchema.shape.items.element.omit({ html: true })),
  }),
  z
    .object({
      completeDocument: z.literal(false),
      error: z.json(),
      items: z.array(z.never()),
      omitted: z.array(z.never()),
    })
    .strict(),
]);
const htmlModelViewInput = z
  .object({
    document: HtmlViewInputSchema.shape.document,
    source: z.number().int().nonnegative(),
    initial: initialHtmlInspection,
    maxBytes: z.number().int().positive(),
    inspection: HtmlViewOutputSchema.nullable(),
  })
  .strict();
const htmlModelViewOutput = z
  .object({
    source: z.number().int().nonnegative(),
    html: z.string(),
    text: z.string(),
    metadata: htmlViewMetadata,
    usable: z.boolean(),
  })
  .strict();
const reviewInspection = z
  .object({
    source: z.number().int().nonnegative(),
    view: HtmlViewOutputSchema.nullable(),
    observation: z.json(),
    usable: z.boolean(),
  })
  .strict();
const reviewTurnState = z
  .object({
    request: reviewInput,
    views: z.array(reviewInspection),
    history: z.array(authorMessage),
    feedback: z.json(),
    budget: ModelAllowanceSchema,
    meta: ReviewSummarySchema.shape.meta,
  })
  .strict();

export const discoveryOutputSchema: JsonObject = jsonSchema(DiscoveryResultSchema);

export const builderContracts: Record<
  string,
  { inputSchema: JsonObject; outputSchema: JsonObject }
> = {
  'model-settings': {
    inputSchema: jsonSchema(
      z
        .object({
          settings: DiscoverySettingsSchema,
          allowance: ModelAllowanceSchema,
          responseAttempts: z.number().int().positive(),
          stepLimit: z.number().int().positive(),
        })
        .strict(),
    ),
    outputSchema: jsonSchema(
      DiscoverySettingsSchema.extend({
        maxSteps: z.number().int(),
        outputAttempts: z.number().int(),
        maxMs: z.number(),
      }),
    ),
  },
  'model-budget': {
    inputSchema: jsonSchema(
      z
        .object({
          author: z
            .object({
              maxModelSteps: z.number().int().positive(),
              maxModelMs: z.number().positive(),
            })
            .loose(),
          review: z
            .object({
              maxModelSteps: z.number().int().positive(),
              maxModelMs: z.number().positive(),
            })
            .loose(),
        })
        .strict(),
    ),
    outputSchema: jsonSchema(
      z.object({ author: ModelAllowanceSchema, review: ModelAllowanceSchema }).strict(),
    ),
  },
  'model-error': {
    inputSchema: jsonSchema(
      z
        .object({
          prefix: z.string(),
          model: z
            .object({
              ok: z.boolean(),
              error: ModelErrorSchema.nullable().optional(),
            })
            .loose()
            .nullable(),
        })
        .strict(),
    ),
    outputSchema: jsonSchema(DiscoveryReasonSchema.nullable()),
  },
  'html-model-view': {
    inputSchema: jsonSchema(htmlModelViewInput),
    outputSchema: jsonSchema(htmlModelViewOutput),
  },
  'review-turn': {
    inputSchema: jsonSchema(reviewTurnState),
    outputSchema: jsonSchema(reviewResult),
  },
  'review-window': {
    inputSchema: jsonSchema(
      z
        .object({
          source: SourceEvidenceSchema,
          index: z.number().int().nonnegative(),
          profile: modelProfile,
          count: z.number().int().positive(),
          views: z.array(reviewInspection),
        })
        .strict(),
    ),
    outputSchema: jsonSchema(
      z
        .object({
          message: z.object({ role: z.literal('user'), content: z.string() }).strict(),
          usable: z.boolean(),
        })
        .strict(),
    ),
  },
  'review-inspect-source': {
    inputSchema: jsonSchema(
      z.object({ request: reviewInput, action: HtmlSourceInspectionSchema }).strict(),
    ),
    outputSchema: jsonSchema(reviewInspection),
  },
  'model-history': {
    inputSchema: jsonSchema(
      z
        .object({
          ...authorHistoryInput,
          job: authorJob,
          scope: z.json(),
          observation: z.string().optional(),
        })
        .strict(),
    ),
    outputSchema: jsonSchema(
      z.object({ messages: z.array(authorMessage), feedback: z.array(authorMessage) }).strict(),
    ),
  },
  'remember-author': {
    inputSchema: jsonSchema(
      z
        .object({
          ...authorHistoryInput,
          job: authorJob,
          scope: z.json(),
          context: z.json(),
          feedback: z.json().nullable(),
          model: z.object({ ok: z.boolean(), decision: z.json().optional() }).loose().nullable(),
        })
        .strict(),
    ),
    outputSchema: jsonSchema(AuthorHistoriesSchema),
  },
  'source-observation': {
    inputSchema: jsonSchema(z.object({ feedback: SourceFeedbackSchema }).strict()),
    outputSchema: jsonSchema(SourceFeedbackSchema),
  },
  'source-fields': {
    inputSchema: jsonSchema(
      z
        .object({
          fields: z.union([HtmlSourceFieldsSchema, HtmlFieldsSchema]).nullable(),
          bounds: AuthoringPolicySchema.shape.fieldBounds,
        })
        .strict(),
    ),
    outputSchema: jsonSchema(HtmlFieldsSchema.nullable()),
  },
  'source-rule-view': {
    inputSchema: jsonSchema(z.object({ rule: schemaObject.nullable() }).strict()),
    outputSchema: jsonSchema(schemaObject.nullable()),
  },
  'generated-schema': {
    inputSchema: jsonSchema(z.object({ schema: schemaObject, nullable: z.boolean() }).strict()),
    outputSchema: jsonSchema(schemaObject),
  },
  'program-context': {
    inputSchema: jsonSchema(z.object({ values: z.array(z.json()).min(1) }).strict()),
    outputSchema: jsonSchema(z.object({ role: z.literal('user'), content: z.string() }).strict()),
  },
  'spend-model': {
    inputSchema: jsonSchema(
      z
        .object({
          allowance: ModelAllowanceSchema,
          meta: ModelMetaSchema.pick({ steps: true, elapsedMs: true }).partial().nullable(),
        })
        .strict(),
    ),
    outputSchema: jsonSchema(ModelAllowanceSchema),
  },
  'captured-trial': {
    inputSchema: jsonSchema(CapturedTrialInputSchema),
    outputSchema: jsonSchema(CapturedTrialOutputSchema),
  },
  'review-evidence': {
    inputSchema: jsonSchema(SourceEvidenceSchema),
    outputSchema: jsonSchema(z.object({ role: z.literal('user'), content: z.string() }).strict()),
  },
  'result-review': {
    inputSchema: jsonSchema(reviewInput),
    outputSchema: jsonSchema(reviewResult),
  },
  bind: { inputSchema: jsonSchema(bindInput), outputSchema: jsonSchema(ArtifactSchema) },
  'bind-document': {
    inputSchema: jsonSchema(bindDocumentInput),
    outputSchema: jsonSchema(ArtifactSchema),
  },
  'bind-output': {
    inputSchema: jsonSchema(bindOutputInput),
    outputSchema: jsonSchema(ArtifactSchema),
  },
  'html-candidate-admission': {
    inputSchema: jsonSchema(htmlAdmission),
    outputSchema: jsonSchema(z.object({ feedback: z.json() }).strict()),
  },
  ...Object.fromEntries(
    Object.entries(phaseContracts).map(([id, contract]) => [
      id,
      { inputSchema: jsonSchema(contract.input), outputSchema: jsonSchema(contract.output) },
    ]),
  ),
};
