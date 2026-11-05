import { z } from 'zod';
import { defineOperation } from '../engine/operation.js';
import { freezeOwned } from '../engine/json.js';
import { OperationFailure } from '../engine/control.js';
import type { Operation, Operations } from '../engine/contracts.js';
import { HttpSourceSchema } from '../operations/http-source.js';
import { HtmlFieldsSchema } from '../readers/html/fields.js';
import { validateLocator, compileClosestLocator } from '../readers/html/index.js';
import {
  createDiscoveryOperations,
  discoveryWorkflow,
  DiscoveryProfileSchema,
  discoveryProfile,
} from '../discovery/index.js';
import { RankingOutputSchema } from './ranking.js';
import {
  DiscoverySettingsSchema,
  createModelOperation,
  createModelOperationOptions,
} from '../discovery/model.js';
import defaults from './default-profile.json' with { type: 'json' };
import { createModelClient } from '../discovery/model-transport.js';
import workflow from './search.json' with { type: 'json' };

export const SearchProfileSchema = z
  .object({
    maxInputBytes: z.number().int().positive(),
    pageDefaults: z
      .object({
        allowLinkFollowing: z.boolean(),
        linkDepth: z.number().int().nonnegative(),
      })
      .strict(),
    provider: z
      .object({
        endpoint: z.url(),
        queryParameter: z.string(),
        selector: z.string(),
        fields: HtmlFieldsSchema.refine(
          (fields) => ['title', 'url', 'description'].every((key) => Object.hasOwn(fields, key)),
          'Search provider must map title, url and description fields',
        ),
        destinationParameter: z.string(),
        wrapper: z
          .object({ origin: z.url(), pathname: z.string().min(1) })
          .strict()
          .nullable(),
        emptySelector: z.string(),
        maxRedirects: z.number().int().nonnegative(),
      })
      .strict(),
    selection: z
      .object({
        maxFollowResults: z.number().int().positive(),
        minSuccessfulSources: z.number().int().nonnegative(),
      })
      .strict(),
    ranking: z
      .object({ instructions: z.string().min(1), settings: DiscoverySettingsSchema })
      .strict(),
    rewrite: z
      .object({
        maxQueryRewrites: z.number().int().nonnegative(),
        instructions: z.string(),
        settings: DiscoverySettingsSchema,
      })
      .strict(),
  })
  .strict();
export const searchProfile = freezeOwned(SearchProfileSchema.parse(defaults));
export const searchWorkflow = freezeOwned({
  ...workflow,
  data: discoveryWorkflow.data,
  flows: [
    ...workflow.flows,
    { id: 'search-page-discovery', revision: 1, flow: discoveryWorkflow.flow },
    ...discoveryWorkflow.flows,
  ],
});

export const createSearchOperations = (
  input: Parameters<typeof createDiscoveryOperations>[0] & {
    searchProfile?: unknown;
    recoverSearch?: Operation;
  },
): ReturnType<typeof createDiscoveryOperations> => {
  const profile = freezeOwned(SearchProfileSchema.parse(input.searchProfile ?? defaults));
  validateLocator(profile.provider.selector);
  validateLocator(profile.provider.emptySelector);
  for (const field of Object.values(profile.provider.fields)) {
    validateLocator(field.selector);
    if (field.closest !== undefined) compileClosestLocator(field.closest);
  }
  const authorCredentials = { apiKey: input.author.apiKey };
  const record = input.record;
  const authorProfile = freezeOwned(
    DiscoveryProfileSchema.parse(input.profile ?? discoveryProfile),
  );
  const base = createDiscoveryOperations({
    author: authorCredentials,
    profile: authorProfile,
    web: input.web,
    mechanical: input.mechanical,
    record,
  });
  const author = createModelClient({
    provider: authorProfile.provider,
    apiKey: authorCredentials.apiKey,
    transport: authorProfile.modelTransport,
  });
  const modelOptions = createModelOperationOptions({
    client: author.client,
    providerBlockFor: author.blockFor,
    profile: authorProfile,
    record,
  });
  const recovery = input.recoverSearch;
  const recoverSearch = recovery?.run.bind(recovery);
  const operations: Operations = {
    ...base.operations,
    'search.profile': defineOperation({
      input: z.null(),
      output: SearchProfileSchema,
      maxJsonDepth: base.limits.maxJsonDepth,
      run: () => profile,
    }),
    'search.recover': defineOperation({
      input: HttpSourceSchema,
      output: HttpSourceSchema,
      maxJsonDepth: base.limits.maxJsonDepth,
      async run(source, context) {
        if (!recoverSearch)
          throw new OperationFailure(
            'SEARCH_ACQUISITION_BLOCKED',
            'Search returned a challenge or unrecognized layout; no discovery-only recovery adapter is configured',
          );
        return recoverSearch(source, context);
      },
    }),
    'search.rank': createModelOperation(RankingOutputSchema, modelOptions),
    'search.rewrite': createModelOperation(
      z
        .object({
          query: z
            .string()
            .min(1)
            .nullable()
            .describe(
              'One different search query likely to locate useful sources for the unchanged instruction; null when no justified alternative remains.',
            ),
        })
        .strict(),
      modelOptions,
    ),
  };
  return { operations, limits: base.limits, close: base.close };
};
