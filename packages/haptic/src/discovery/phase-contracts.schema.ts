import { z } from 'zod';
import { AuthorHistoriesSchema } from './author-history.schema.js';
import { FlowSchema } from '../engine/schema.js';
import { HttpSourceSchema } from '../operations/http-source.js';
import { XmlSelectionSchema } from '../operations/xml.js';
import { HtmlSelectedItemSchema } from '../operations/web.js';
import { HtmlReferenceRecordSchema } from './references.schema.js';
import { HtmlDocumentSchema } from './html-inspection.js';
import {
  HtmlContextOutputSchema,
  HtmlContextPolicySchema,
  HtmlContextReportSchema,
} from './html-context.js';
import { HtmlAuthorOutputSchema, StageRuleSchema, TaskDeclarationSchema } from './rules.schema.js';
import { AuthoringPolicySchema } from './html-measure.js';
import { HtmlDiagnosticPolicySchema } from './html-match-diagnostics.js';
import { InitialHtmlViewSchema } from './html-view.js';
import { DiscoveryModelInputSchema, DiscoverySettingsSchema } from './model.js';
import {
  DiscoveryReasonSchema,
  ModelResultSchema,
  ModelSourcesSchema,
} from './model-result.schema.js';
import { SourceEvidenceSchema } from './review.schema.js';
import {
  ModelBudgetSchema,
  ModelAllowanceSchema,
  RecordedTrialSchema,
  ReviewSummarySchema,
} from './discovery-result.schema.js';
import { TrialResultSchema } from './trial.js';
import { CapturedTrialInputSchema } from './captured-trial.schema.js';
import {
  FormatsSchema,
  ResultFlowSchema,
  ResultFlowsSchema,
  ResourcePolicySchema,
  ResultSchema,
  TraversalPolicySchema,
} from './result.schema.js';

const jsonObject = z.record(z.string(), z.json());
const urls = z.array(z.url());
const reason = DiscoveryReasonSchema;
const format = z.enum(['html', 'json', 'xml']);

export const SourceIdentitySchema = z
  .object({ url: z.url(), sha256: HttpSourceSchema.shape.body.shape.sha256 })
  .strict();
export const CaptureSchema = CapturedTrialInputSchema.shape.captures.element;
export const RedirectIdentitySchema = HttpSourceSchema.pick({
  url: true,
  status: true,
  headers: true,
})
  .extend({ sha256: HttpSourceSchema.shape.body.shape.sha256 })
  .strict();
export const AcquisitionSchema = z
  .object({
    sources: z.array(CaptureSchema),
    redirects: z.array(RedirectIdentitySchema),
    visited: urls,
    seen: urls,
  })
  .strict();
const resourceAcquisition = z
  .object({
    sources: z.array(CaptureSchema),
    redirects: z.array(HttpSourceSchema),
    visited: urls,
    seen: urls,
    limited: z.boolean(),
  })
  .strict();
const htmlDocument = z.union([HtmlDocumentSchema, HtmlContextOutputSchema]);
const jsonDocument = z.object({ url: z.url(), document: z.json() }).strict();
const xmlDocument = z.object({ url: z.url(), xml: z.string(), encoding: z.string() }).strict();
const owned = { index: z.number().int().nonnegative(), source: SourceIdentitySchema };
export const OwnedSourceSchema = z.discriminatedUnion('format', [
  z.object({ ...owned, format: z.literal('html'), document: htmlDocument }).strict(),
  z.object({ ...owned, format: z.literal('json'), document: jsonDocument }).strict(),
  z.object({ ...owned, format: z.literal('xml'), document: xmlDocument }).strict(),
]);
const fullOwned = { index: z.number().int().nonnegative(), source: HttpSourceSchema };
export const MaterializedSourceSchema = z.discriminatedUnion('format', [
  z.object({ ...fullOwned, format: z.literal('html'), document: htmlDocument }).strict(),
  z.object({ ...fullOwned, format: z.literal('json'), document: jsonDocument }).strict(),
  z.object({ ...fullOwned, format: z.literal('xml'), document: xmlDocument }).strict(),
]);

// Draft XML stages deliberately carry null extraction/mapping until their paired trial passes.
const draftReference = z
  .object({
    id: z.string(),
    format: z.enum(['json', 'xml']),
    xml: XmlSelectionSchema.nullable(),
    mapping: z.json().optional(),
  })
  .strict();
const draftRule = HtmlAuthorOutputSchema.extend({
  reference: draftReference.nullable().optional(),
  xml: XmlSelectionSchema.optional(),
});
const trialValue = z.object({ source: z.object({ url: z.url() }).strict().optional() }).loose();
// artifact.trial identifies complete cases; XML per-item trials and feedback projections are
// ordinary engine outcomes without a case ID. Preserve both owners rather than inventing IDs.
const sourceOutcome = TrialResultSchema.strict();
const sourceTrialInput = z.union([RecordedTrialSchema, sourceOutcome]);
export const SourceTrialSchema = z.union([
  RecordedTrialSchema.extend({ value: trialValue.nullable() }),
  sourceOutcome.extend({ value: trialValue.nullable() }),
]);
const levelFields = {
  depth: z.number().int().nonnegative(),
  format: format.nullable(),
  frontier: urls,
  sources: z.array(SourceIdentitySchema),
  redirects: z.array(RedirectIdentitySchema),
  reference: z.boolean(),
  standalone: z.boolean(),
  trials: z.array(SourceTrialSchema),
};
export const LevelSchema = z.discriminatedUnion('ready', [
  z.object({ ...levelFields, ready: z.literal(false), rule: draftRule.nullable() }).strict(),
  z
    .object({
      ...levelFields,
      ready: z.literal(true),
      rule: StageRuleSchema.extend({ xml: XmlSelectionSchema.optional() }),
    })
    .strict(),
]);
const readyLevel = LevelSchema.options[1];
const focus = z
  .object({
    stage: z.number().int().nonnegative(),
    part: z.enum([
      'initial',
      'selection',
      'navigation',
      'processing',
      'referenceRule',
      'referenceProgram',
    ]),
  })
  .strict();
export const SourceFeedbackSchema = z
  .object({
    failure: z
      .object({
        kind: z.literal('source-trial'),
        rule: z.json(),
        passed: z.literal(false),
        feedback: z.json(),
        trials: z.array(SourceTrialSchema),
        selectedValues: z.array(z.json()).optional(),
      })
      .strict()
      .nullable(),
    inspection: z
      .object({
        kind: z.literal('source-inspection'),
        request: z.json(),
        source: SourceIdentitySchema.nullable(),
        repeated: z.boolean(),
        result: z.json(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const htmlContext = z
  .object({
    enabled: z.boolean(),
    policy: HtmlContextPolicySchema,
    maxInlineBytes: z.number().int().positive(),
    initialInspection: InitialHtmlViewSchema,
  })
  .strict();
const observations = z
  .object({
    maxBytes: z.number().int().positive(),
    useScopedHtml: z.boolean(),
    skipRepeated: z.boolean(),
  })
  .strict();
const sourceProfile = z
  .object({
    settings: DiscoverySettingsSchema,
    maxInputBytes: z.number().int().positive(),
    author: z.object({ maxResponseAttempts: z.number().int().positive() }).strict(),
    formats: FormatsSchema,
    resources: ResourcePolicySchema,
    resultFlows: ResultFlowsSchema,
    authoring: AuthoringPolicySchema,
    minimumResultMatches: z.number().int().nonnegative(),
    htmlContext,
    observations,
    diagnostics: HtmlDiagnosticPolicySchema.nullable(),
  })
  .strict();
const nativeInput = z
  .object({ data: z.json(), meta: z.object({ visited: urls, limited: z.boolean() }).loose() })
  .strict();
const internalReview = ReviewSummarySchema.extend({ rawSources: ModelSourcesSchema });
const partialTrial = z.object({ outputSchema: jsonObject, outcome: RecordedTrialSchema }).strict();
const completedTrial = RecordedTrialSchema.extend({
  status: z.literal('completed'),
  error: z.null(),
});
const lastWorking = z
  .object({
    artifact: jsonObject,
    schema: jsonObject,
    capturedTrial: completedTrial,
    partialTrial: partialTrial.nullable(),
    review: internalReview.nullable(),
  })
  .strict();

const authorJobFields = {
  instruction: z.string().min(1),
  asOf: z.iso.datetime({ offset: true }).nullable(),
  settings: DiscoverySettingsSchema,
  responseAttempts: z.number().int().positive(),
  maxInputBytes: z.number().int().positive(),
  allowance: ModelAllowanceSchema,
  histories: AuthorHistoriesSchema,
  repairFeedback: z.json().nullable(),
  repairCount: z.number().int().nonnegative(),
  feedback: z.json().nullable(),
};
const authorJobOutcome = {
  allowance: ModelAllowanceSchema,
  histories: AuthorHistoriesSchema,
  feedback: z.json().nullable(),
  reason: reason.nullable(),
};
const contractJob = z
  .object({
    ...authorJobFields,
    sourceData: z.json(),
    stamp: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();
const outputObservation = z
  .object({
    sourceArtifact: jsonObject,
    sourceFlow: ResultFlowSchema,
    shapedFlow: FlowSchema,
    mapping: z.json(),
    schema: jsonObject,
    url: z.url(),
    captures: z.array(CaptureSchema),
    partialTrial: partialTrial.nullable(),
  })
  .strict();
const outputJob = outputObservation
  .omit({ mapping: true })
  .extend({
    ...authorJobFields,
    sourceData: z.json(),
  })
  .strict();
const observedOutput = z
  .object({
    artifact: jsonObject,
    capturedTrial: RecordedTrialSchema,
    partialTrial: partialTrial.nullable(),
    feedback: z.json(),
    reason: z.null(),
  })
  .strict();
const outputJobOutcomeFields = {
  ...authorJobOutcome,
  mapping: z.json(),
  partialTrial: partialTrial.nullable(),
};
const outputJobOutcome = z.union([
  z
    .object({
      ...outputJobOutcomeFields,
      reason: z.null(),
      artifact: jsonObject,
      capturedTrial: completedTrial,
    })
    .strict(),
  z
    .object({
      ...outputJobOutcomeFields,
      reason,
      artifact: jsonObject.nullable(),
      capturedTrial: RecordedTrialSchema.nullable(),
    })
    .strict(),
]);
const taskJob = z
  .object({
    url: z.url(),
    instruction: authorJobFields.instruction,
    asOf: authorJobFields.asOf,
    allowResourceFetching: z.boolean(),
    resultFlows: ResultFlowsSchema,
    allowLinkFollowing: z.boolean(),
    linkDepth: z.number().int().nonnegative(),
    settings: DiscoverySettingsSchema,
    responseAttempts: z.number().int().positive(),
    maxInputBytes: z.number().int().positive(),
    allowance: ModelAllowanceSchema,
    feedback: z.json().nullable(),
  })
  .strict();
// A mechanical observation may reject a candidate while leaving reason null for the JSON
// repair loop. Its outcome status carries that result; publication owns completed success.

export type PhaseContract = { input: z.ZodType; output: z.ZodType };
const sourceTrialInputSchema = z
  .object({
    level: LevelSchema,
    sources: z.array(HttpSourceSchema),
    task: TaskDeclarationSchema,
    blueprint: jsonObject,
    policy: TraversalPolicySchema,
    authoring: AuthoringPolicySchema,
    resources: ResourcePolicySchema,
    formats: FormatsSchema,
    resultFlows: ResultFlowsSchema,
    htmlContext: htmlContext.pick({ enabled: true, policy: true }),
    diagnostics: HtmlDiagnosticPolicySchema.nullable(),
    minimumResultMatches: z.number().int().nonnegative(),
    part: focus.shape.part,
  })
  .strict();
// Source authoring owns exactly one current level. Traversal owns the global level list,
// capture lookup and review-independent author allowance composition.
const sourceJob = sourceTrialInputSchema
  .extend({
    ...authorJobFields,
    sources: z.array(MaterializedSourceSchema),
    schema: jsonObject.nullable(),
    htmlContext,
    observations,
  })
  .strict();
const sourceResultFields = {
  level: LevelSchema,
  part: focus.shape.part,
  feedback: z.json().nullable(),
  allowance: ModelAllowanceSchema,
  histories: AuthorHistoriesSchema,
  reason: reason.nullable(),
};
const sourceJobOutcome = z.union([
  z.object({ ...sourceResultFields, level: readyLevel, reason: z.null() }).strict(),
  z.object({ ...sourceResultFields, reason }).strict(),
]);
const traversalFields = {
  acquisition: AcquisitionSchema,
  owned: z.array(OwnedSourceSchema),
  levels: z.array(LevelSchema),
  frontier: urls,
  processed: urls,
  depth: z.number().int().nonnegative(),
  focus,
  allowance: ModelAllowanceSchema,
  histories: AuthorHistoriesSchema,
  feedback: z.json().nullable(),
  reason: reason.nullable(),
  hasNext: z.boolean(),
};
const traversalFrame = z
  .object({
    ...traversalFields,
    fixed: z
      .object({
        instruction: authorJobFields.instruction,
        asOf: authorJobFields.asOf,
        profile: sourceProfile,
        policy: TraversalPolicySchema,
        blueprint: jsonObject,
      })
      .strict(),
    task: TaskDeclarationSchema,
    schema: jsonObject.nullable(),
    repairFeedback: z.json().nullable(),
    repairCount: z.number().int().nonnegative(),
  })
  .strict();
const traversalOutcome = z.object(traversalFields).strict();
export const phaseContracts: Record<string, PhaseContract> = {
  'test-xml-reference': {
    input: sourceTrialInputSchema
      .omit({ part: true })
      .extend({
        ...authorJobFields,
        feedback: SourceFeedbackSchema,
        xml: XmlSelectionSchema,
        level: LevelSchema.options[0].extend({
          format: z.literal('xml'),
          reference: z.literal(true),
          standalone: z.literal(false),
        }),
        observationMaxBytes: z.number().int().positive(),
      })
      .strict(),
    output: z
      .object({
        level: LevelSchema,
        feedback: SourceFeedbackSchema,
        allowance: ModelAllowanceSchema,
        histories: AuthorHistoriesSchema,
        reason: reason.nullable(),
      })
      .strict(),
  },
  'reference-proposal': {
    input: z
      .object({
        values: z.array(z.json()).min(1),
        feedback: z.json().nullable(),
        instruction: z.string().min(1),
        asOf: z.iso.datetime({ offset: true }).nullable(),
        task: TaskDeclarationSchema,
        canFollow: z.boolean(),
        canFetch: z.boolean(),
        settings: DiscoverySettingsSchema,
        responseAttempts: z.number().int().positive(),
        maxInputBytes: z.number().int().positive(),
        allowance: ModelAllowanceSchema,
        histories: AuthorHistoriesSchema,
        repairFeedback: z.json().nullable(),
        repairCount: z.number().int().nonnegative(),
        scope: z
          .object({
            format: z.enum(['json', 'xml']),
            frontier: z.array(z.url()),
          })
          .strict(),
      })
      .strict(),
    output: z
      .object({ model: ModelResultSchema.nullable(), allowance: ModelAllowanceSchema })
      .strict(),
  },
  'fresh-phase': {
    input: z.object({ artifact: jsonObject, url: z.url() }).strict(),
    output: z.union([
      z
        .object({
          published: z.literal(true),
          fresh: completedTrial,
          reason: reason.nullable(),
        })
        .strict(),
      z
        .object({ published: z.literal(false), fresh: RecordedTrialSchema.nullable(), reason })
        .strict(),
    ]),
  },
  'build-result': {
    input: z.object({ reason: reason.nullable(), lastWorking: lastWorking.nullable() }).loose(),
    output: z.union([
      z
        .object({
          reason: z.null(),
          artifact: jsonObject,
          schema: jsonObject,
          capturedTrial: completedTrial,
          partialTrial: partialTrial.nullable(),
          review: internalReview.nullable(),
          budget: ModelBudgetSchema,
        })
        .loose(),
      z.object({ reason, budget: ModelBudgetSchema }).loose(),
    ]),
  },
  'html-context': {
    input: z
      .object({
        configuration: htmlContext,
        documents: z.array(
          z
            .object({ status: z.literal('completed'), value: HtmlDocumentSchema, error: z.null() })
            .strict(),
        ),
      })
      .strict(),
    output: z
      .object({
        documents: z.array(
          z
            .object({ status: z.literal('completed'), value: htmlDocument, error: z.null() })
            .strict(),
        ),
        reports: z.array(HtmlContextReportSchema),
      })
      .strict(),
  },
  'acquire-phase': {
    input: z
      .object({
        frontier: urls,
        processed: urls,
        acquisition: AcquisitionSchema,
        owned: z.array(OwnedSourceSchema),
        depth: z.number().int().nonnegative(),
        task: TaskDeclarationSchema,
        policy: TraversalPolicySchema,
        formats: FormatsSchema,
        htmlContext,
      })
      .strict(),
    output: z
      .object({
        acquisition: AcquisitionSchema,
        owned: z.array(OwnedSourceSchema),
        level: LevelSchema,
        processed: urls,
        focus,
        feedback: z.json(),
        reason: reason.nullable(),
      })
      .strict(),
  },
  'advance-phase': {
    input: z
      .object({
        captures: z.array(
          z
            .object({
              source: z.object({ url: z.url() }).strict().nullable(),
              redirects: z.array(z.object({ url: z.url() }).strict()),
            })
            .strict(),
        ),
        visited: urls,
        depth: z.number().int().nonnegative(),
        policy: TraversalPolicySchema,
        level: LevelSchema,
        processed: urls,
      })
      .strict(),
    output: z
      .object({
        hasNext: z.boolean(),
        depth: z.number().int().nonnegative(),
        frontier: urls,
      })
      .strict(),
  },
  traverse: {
    input: traversalFrame,
    output: traversalOutcome,
  },
  'level-sources': {
    input: z
      .object({
        captures: z.array(CaptureSchema),
        owned: z.array(OwnedSourceSchema),
        level: LevelSchema,
      })
      .strict(),
    output: z.array(MaterializedSourceSchema),
  },
  'owned-sources': {
    input: z
      .object({ previous: z.array(OwnedSourceSchema), current: z.array(OwnedSourceSchema) })
      .strict(),
    output: z.array(OwnedSourceSchema),
  },
  'source-redirects': {
    input: z.object({ responses: z.array(HttpSourceSchema) }).strict(),
    output: z.array(RedirectIdentitySchema),
  },
  'merge-captures': {
    input: z
      .object({
        previous: z.array(CaptureSchema),
        acquired: z
          .object({ sources: z.array(CaptureSchema), redirects: z.array(HttpSourceSchema) })
          .strict(),
      })
      .strict(),
    output: z.array(CaptureSchema),
  },
  'source-request': {
    input: sourceJob
      .pick({
        level: true,
        sources: true,
        task: true,
        schema: true,
        instruction: true,
        asOf: true,
        policy: true,
        resources: true,
        settings: true,
        responseAttempts: true,
        maxInputBytes: true,
        observations: true,
        htmlContext: true,
        allowance: true,
        histories: true,
        repairFeedback: true,
        repairCount: true,
        feedback: true,
        part: true,
      })
      .extend({ feedback: SourceFeedbackSchema })
      .strict(),
    output: DiscoveryModelInputSchema.extend({
      settings: DiscoverySettingsSchema.extend({
        maxSteps: z.number().int(),
        outputAttempts: z.number().int(),
        maxMs: z.number(),
      }),
      evidenceReady: z.boolean(),
    }),
  },
  'build-source': { input: sourceJob, output: sourceJobOutcome },
  'build-reference': { input: sourceJob, output: sourceJobOutcome },
  'observe-source': {
    input: sourceTrialInputSchema,
    output: z
      .object({
        passed: z.boolean(),
        trials: z.array(SourceTrialSchema),
        feedback: z.json(),
        part: z.string(),
        kind: z.string().optional(),
        selectedValues: z.array(z.json()).optional(),
      })
      .strict(),
  },
  'test-source': {
    input: sourceJob
      .pick({
        level: true,
        sources: true,
        task: true,
        blueprint: true,
        policy: true,
        authoring: true,
        resources: true,
        formats: true,
        resultFlows: true,
        htmlContext: true,
        diagnostics: true,
        minimumResultMatches: true,
        observations: true,
        part: true,
      })
      .extend({ candidate: z.json() })
      .strict(),
    output: z
      .object({
        level: LevelSchema,
        part: focus.shape.part,
        feedback: SourceFeedbackSchema,
        reason: reason.nullable(),
      })
      .strict(),
  },
  'inspect-source': {
    input: sourceJob
      .pick({
        sources: true,
        authoring: true,
        htmlContext: true,
        maxInputBytes: true,
        observations: true,
        feedback: true,
      })
      .extend({
        feedback: SourceFeedbackSchema,
        action: z
          .object({
            source: z.number().int().nonnegative(),
            query: z.json(),
            window: z
              .object({
                offset: z.number().int().nonnegative(),
                limit: z.number().int().positive(),
              })
              .strict(),
          })
          .loose(),
      })
      .strict(),
    output: z.object({ feedback: SourceFeedbackSchema, reason: reason.nullable() }).strict(),
  },
  'source-trials': {
    input: z.object({ trials: z.array(sourceTrialInput) }).strict(),
    output: z.array(SourceTrialSchema),
  },
  'assemble-state': {
    input: z
      .object({
        url: z.url(),
        blueprint: jsonObject,
        policy: TraversalPolicySchema,
        formats: FormatsSchema,
        resources: ResourcePolicySchema,
        minimumResultMatches: z.number().int().nonnegative(),
        levels: z.array(LevelSchema),
        task: TaskDeclarationSchema,
        captures: z.array(CaptureSchema),
        owned: z.array(OwnedSourceSchema),
        resourceAcquisition,
      })
      .strict(),
    output: z.union([
      z
        .object({
          reason: z.null(),
          sourceArtifact: jsonObject,
          nativeInput,
          resourceAcquisition,
          sourceFlow: ResultFlowSchema,
          sourceEvidence: z.array(SourceEvidenceSchema),
          limited: z.boolean(),
        })
        .strict(),
      z
        .object({
          reason,
          sourceArtifact: jsonObject.nullable(),
          nativeInput: nativeInput.nullable(),
          resourceAcquisition,
          sourceFlow: ResultFlowSchema,
          sourceEvidence: z.array(SourceEvidenceSchema),
          limited: z.boolean(),
        })
        .strict(),
    ]),
  },
  'observe-output': { input: outputObservation, output: observedOutput },
  'declare-task': {
    input: taskJob,
    output: z.union([
      z
        .object({
          reason: z.null(),
          task: TaskDeclarationSchema,
          allowance: ModelAllowanceSchema,
        })
        .strict(),
      z
        .object({
          reason,
          task: z.null(),
          allowance: ModelAllowanceSchema,
        })
        .strict(),
    ]),
  },
  'declare-contract': {
    input: contractJob,
    output: z.union([
      z.object({ ...authorJobOutcome, reason: z.null(), schema: jsonObject }).strict(),
      z.object({ ...authorJobOutcome, reason, schema: jsonObject.nullable() }).strict(),
    ]),
  },
  'build-output': { input: outputJob, output: outputJobOutcome },
};

const selectedItem = z.union([
  HtmlSelectedItemSchema,
  HtmlReferenceRecordSchema,
  z.object({ reference: z.string() }).strict(),
]);
const selection = z
  .object({ baseUrl: z.string(), encoding: z.string(), items: z.array(selectedItem) })
  .strict();
const selectedPage = selection.extend({ url: z.url(), result: ResultSchema });
const sourceSelection = z
  .object({
    source: HttpSourceSchema,
    selection: selection.nullable(),
    urls,
    navigation: z
      .object({
        matchedElements: z.number().int().nonnegative(),
        collectedUrls: z.number().int().nonnegative(),
        collectionLimit: z.number().int().positive(),
        collectionAtLimit: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const traversalResult = z
  .object({
    pages: z.array(selectedPage),
    visited: urls,
    limited: z.boolean(),
    redirects: z.array(HttpSourceSchema),
  })
  .strict();
const batchResult = z
  .object({
    sources: z.array(CaptureSchema),
    seen: urls,
    visited: urls,
    redirects: z.array(HttpSourceSchema),
  })
  .strict();
const resourceResult = z
  .object({
    items: z.array(CaptureSchema),
    visited: urls,
    redirects: z.array(HttpSourceSchema),
    limited: z.boolean(),
  })
  .strict();
const recordProvenance = { sourceUrl: z.url(), baseUrl: z.string(), encoding: z.string() };
const outputRecord = z.union([
  HtmlSelectedItemSchema.extend(recordProvenance),
  HtmlReferenceRecordSchema.extend(recordProvenance),
  z.object({ reference: z.string(), ...recordProvenance }).strict(),
]);
const documentResultMetadata = {
  visited: urls,
  limited: z.boolean(),
  redirects: z.array(HttpSourceSchema),
};

/** Runtime helpers are views of already admitted execution values, not discovery working state. */
export const mechanicalPhaseContracts: Record<string, PhaseContract> = {
  fetch: {
    input: z
      .object({
        url: z.url(),
        remaining: z.number().int().nonnegative(),
        seen: urls,
        accept: TraversalPolicySchema.shape.accept,
      })
      .strict(),
    output: CaptureSchema,
  },
  select: {
    input: z
      .object({
        source: HttpSourceSchema,
        rule: StageRuleSchema,
        policy: TraversalPolicySchema,
        canFollow: z.boolean(),
        seen: urls.optional(),
        minimumResultMatches: z.number().int().nonnegative(),
      })
      .strict(),
    output: sourceSelection.extend({ navigation: sourceSelection.shape.navigation.optional() }),
  },
  stage: {
    input: z
      .object({
        url: z.url(),
        source: HttpSourceSchema.optional(),
        rule: StageRuleSchema,
        policy: TraversalPolicySchema,
        canFollow: z.boolean(),
        minimumResultMatches: z.number().int().nonnegative(),
        seen: urls,
      })
      .strict(),
    output: sourceSelection.extend({
      navigation: sourceSelection.shape.navigation.optional(),
      redirects: z.array(HttpSourceSchema),
    }),
  },
  walk: {
    input: z
      .object({
        urls,
        visited: urls,
        seen: urls,
        depth: z.number().int().nonnegative(),
        stages: z.array(StageRuleSchema),
        policy: TraversalPolicySchema,
        minimumResultMatches: z.number().int().nonnegative(),
      })
      .strict(),
    output: traversalResult,
  },
  batch: {
    input: z
      .object({
        urls,
        visited: urls,
        seen: urls,
        policy: TraversalPolicySchema.pick({ maxRedirects: true, accept: true }),
      })
      .strict(),
    output: batchResult,
  },
  'fetch-resources': {
    input: z
      .object({
        pages: z.array(selection.extend({ result: ResultSchema }).loose()),
        policy: ResourcePolicySchema,
      })
      .strict(),
    output: resourceResult,
  },
  'read-json': {
    input: z
      .object({ url: z.url(), policy: TraversalPolicySchema, formats: FormatsSchema })
      .strict(),
    output: jsonDocument.extend(documentResultMetadata),
  },
  'read-xml': {
    input: z
      .object({
        url: z.url(),
        policy: TraversalPolicySchema,
        formats: FormatsSchema,
        rule: XmlSelectionSchema,
      })
      .strict(),
    output: z
      .object({ url: z.url(), items: z.array(jsonObject), ...documentResultMetadata })
      .strict(),
  },
  admit: {
    input: z
      .object({ urls, seen: urls, visited: urls, maxPages: z.number().int().nonnegative() })
      .strict(),
    output: urls,
  },
  redirect: {
    input: z.object({ status: z.number().int().min(100).max(599) }).loose(),
    output: z.boolean(),
  },
  'source-format': {
    input: z.object({ source: HttpSourceSchema, formats: FormatsSchema }).strict(),
    output: z.object({ mediaType: z.string(), adapters: z.array(format) }).strict(),
  },
  'require-format': {
    input: z.object({ source: HttpSourceSchema, formats: FormatsSchema, adapter: format }).strict(),
    output: z.object({ mediaType: z.string(), adapters: z.array(format) }).strict(),
  },
  'output-source': {
    input: z
      .object({
        pages: z.array(
          z
            .object({
              url: z.url(),
              baseUrl: z.string(),
              encoding: z.string(),
              items: z.array(z.union([HtmlSelectedItemSchema, jsonObject])),
            })
            .loose(),
        ),
        visited: urls,
        limited: z.boolean(),
        resources: z
          .object({ items: z.array(z.object({ source: HttpSourceSchema }).loose()) })
          .loose()
          .optional(),
      })
      .loose(),
    output: z
      .object({
        data: z
          .object({
            records: z.array(outputRecord),
            visited: urls,
            limited: z.boolean(),
            resourceUrls: urls,
          })
          .strict(),
        meta: z.object({ visited: urls, limited: z.boolean() }).loose(),
      })
      .strict(),
  },
  'json-output-source': {
    input: jsonDocument
      .extend({ visited: urls, limited: z.boolean(), redirects: z.array(HttpSourceSchema) })
      .loose(),
    output: z
      .object({
        data: jsonDocument,
        meta: z
          .object({ visited: urls, limited: z.boolean(), redirects: z.array(HttpSourceSchema) })
          .strict(),
      })
      .strict(),
  },
  'xml-output-source': {
    input: z
      .object({
        url: z.url(),
        items: z.array(jsonObject),
        visited: urls,
        limited: z.boolean(),
        redirects: z.array(HttpSourceSchema),
      })
      .loose(),
    output: z
      .object({
        data: z.object({ url: z.url(), items: z.array(jsonObject) }).strict(),
        meta: z
          .object({ visited: urls, limited: z.boolean(), redirects: z.array(HttpSourceSchema) })
          .strict(),
      })
      .strict(),
  },
};
