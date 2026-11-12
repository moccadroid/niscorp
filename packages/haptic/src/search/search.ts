import { createSignal, type Signal } from '@niscorp/signal';
import { z } from 'zod';
import { fetchPage, WalkError } from '../artifact/walk.js';
import type { Artifact } from '../artifact/schema.js';
import {
  createCalls,
  DiscoveryStop,
  type Calls,
  type DiscoveryEvent,
  type Usage,
} from '../discovery/calls.js';
import { discover, type DiscoveryResult, type Trial } from '../discovery/discover.js';
import { DiscoveryProfileSchema, type DiscoveryProfileInput } from '../discovery/profile.js';
import { createWebTransport, type WebTransport } from '../web/transport.js';
import type { HttpSource } from '../web/source.js';
import { duckduckgo } from './duckduckgo.js';
import { solveImageChallenge } from './image-challenge.js';
import {
  QUERY_DESCRIPTION,
  RANK_INSTRUCTIONS,
  RANKED_IDS_DESCRIPTION,
  rankRetry,
  REWRITE_INSTRUCTIONS,
  rewriteRetry,
} from './prompts.js';
import {
  readResultsPage,
  SearchProviderSchema,
  type Candidate,
  type SearchProvider,
} from './provider.js';

export const SearchRequestSchema = z
  .object({
    instruction: z.string().min(1),
    query: z.string().min(1).optional(),
    asOf: z.string().min(1).optional(),
    maxFollowResults: z.number().int().positive().optional(),
    minSuccessfulSources: z.number().int().nonnegative().optional(),
    maxQueryRewrites: z.number().int().nonnegative().optional(),
    page: z
      .object({
        allowLinkFollowing: z.boolean().optional(),
        linkDepth: z.number().int().positive().optional(),
        maxPages: z.number().int().positive().optional(),
        outputSchema: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SearchRequest = z.input<typeof SearchRequestSchema>;

export const SearchProfileSchema = z
  .object({
    maxFollowResults: z.number().int().positive().default(5),
    minSuccessfulSources: z.number().int().nonnegative().default(2),
    maxQueryRewrites: z.number().int().nonnegative().default(1),
    pageDefaults: z
      .object({ allowLinkFollowing: z.boolean(), linkDepth: z.number().int().positive() })
      .strict()
      .default({ allowLinkFollowing: true, linkDepth: 1 }),
    rankSteps: z.number().int().positive().default(3),
    rewriteSteps: z.number().int().positive().default(3),
    searchTimeoutMs: z
      .number()
      .int()
      .positive()
      .default(13 * 60_000),
    discovery: z
      .custom<DiscoveryProfileInput>()
      .default({})
      .describe(
        "The profile every destination discovery and search's own agents use; search's agents run at high effort.",
      ),
  })
  .strict();
export type SearchProfileInput = z.input<typeof SearchProfileSchema>;

export type SearchOptions = {
  groqKey: string;
  // Labels in each discovery, and the image challenge; required when the provider declares a challenge.
  typesafeKey?: string | null;
  provider?: SearchProvider;
  profile?: SearchProfileInput;
  web?: WebTransport;
  signal?: AbortSignal;
  onEvent?: (event: DiscoveryEvent) => void;
  // Replaces search's own model calls (tests).
  calls?: Calls;
  // Replaces each destination's discovery (tests).
  discover?: typeof discover;
};

export type Observation = {
  url: string;
  status: 'ready' | 'unresolved' | 'blocked' | 'failed';
  reason: string | null;
  findings: string[];
};
export type Destination = {
  source: Candidate;
  status: Observation['status'];
  artifact: Artifact | null;
  trial: Trial | null;
  execution: unknown;
  usable: boolean;
  feedback: {
    status: Observation['status'];
    reason: string | null;
    trialError: string | null;
    findings: string[];
  };
  usage: Usage;
};
export type SearchAttempt = { query: string; candidates: Candidate[]; rankedIds: string[] };
export type SearchResult = {
  instruction: string;
  attempts: SearchAttempt[];
  selected: Candidate[];
  successfulSources: number;
  insufficient: boolean;
  destinations: Destination[];
  continuationError: {
    phase: 'rewrite' | 'search';
    error: { code: string; message: string };
  } | null;
  usage: Usage;
};

export class SearchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const RankSchema = z
  .object({ rankedIds: z.array(z.string().min(1)).describe(RANKED_IDS_DESCRIPTION) })
  .strict();
const RewriteSchema = z
  .object({ query: z.string().min(1).nullable().describe(QUERY_DESCRIPTION) })
  .strict();

const observe = (destination: Destination): Observation => ({
  url: destination.source.url,
  status: destination.status,
  reason: destination.feedback.reason,
  findings: destination.feedback.findings,
});
const codeOf = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'SEARCH_FAILED';

// Search: the provider's results for the query, ranked by a model, discovered one by one; a rewritten query when
// the queue is spent and too few sources are usable.
export const search = async (
  requestInput: SearchRequest,
  options: SearchOptions,
): Promise<SearchResult> => {
  const request = SearchRequestSchema.parse(requestInput);
  const profile = SearchProfileSchema.parse(options.profile ?? {});
  const provider = SearchProviderSchema.parse(options.provider ?? duckduckgo);
  const discoveryProfile = DiscoveryProfileSchema.parse(profile.discovery);
  const maxFollow = request.maxFollowResults ?? profile.maxFollowResults;
  const minimum = request.minSuccessfulSources ?? profile.minSuccessfulSources;
  let rewritesLeft = request.maxQueryRewrites ?? profile.maxQueryRewrites;
  if (minimum > maxFollow)
    throw new SearchError(
      'SEARCH_MINIMUM',
      `minSuccessfulSources (${minimum}) is above maxFollowResults (${maxFollow})`,
    );
  if (provider.challenge && !options.typesafeKey)
    throw new SearchError(
      'SEARCH_JEV_KEY',
      `the ${provider.id} provider can answer with an image challenge; a TypeSafe key is required`,
    );

  const signal = AbortSignal.any([
    options.signal ?? new AbortController().signal,
    AbortSignal.timeout(profile.searchTimeoutMs),
  ]);
  const ownWeb = options.web ? null : createWebTransport();
  const web = (options.web ?? ownWeb) as WebTransport;
  const events: DiscoveryEvent[] = [];
  const event = (job: string, body: Record<string, unknown>) => {
    const entry = { job, at: Date.now(), event: body };
    events.push(entry);
    options.onEvent?.(entry);
  };
  const usage: Usage = {};
  const calls =
    options.calls ??
    createCalls({
      groqKey: options.groqKey,
      typesafeKey: null,
      profile: discoveryProfile,
      effort: 'high',
      budget: { used: 0, cap: discoveryProfile.maxInputTokens },
      signal,
      usage,
      events,
    });
  const jev: Signal | null = options.typesafeKey
    ? createSignal('typesafe', { apiKey: options.typesafeKey })
    : null;
  const run = options.discover ?? discover;
  const page = {
    allowLinkFollowing: request.page?.allowLinkFollowing ?? profile.pageDefaults.allowLinkFollowing,
    linkDepth: request.page?.linkDepth ?? profile.pageDefaults.linkDepth,
    maxPages: request.page?.maxPages ?? discoveryProfile.maxPages,
    outputSchema: request.page?.outputSchema ?? null,
  };
  const perDestination = { ...page, ...(request.asOf ? { asOf: request.asOf } : {}) };

  const attempts: SearchAttempt[] = [];
  const selected: Candidate[] = [];
  const destinations: Destination[] = [];
  const attempted = new Set<string>();
  const queries: string[] = [];
  let continuationError: SearchResult['continuationError'] = null;
  const usableCount = () => destinations.filter((d) => d.usable).length;

  // The provider page for a query, after its challenge when one appears: candidates, or none.
  const acquire = async (query: string): Promise<Candidate[]> => {
    const url = new URL(provider.query.url);
    url.searchParams.set(provider.query.parameter, query);
    const policy = {
      maxPages: 1,
      maxRedirects: provider.maxRedirects,
      stripFragments: true,
      accept: provider.accept,
    };
    let source: HttpSource = await fetchPage(web, url.href, policy, signal);
    let read = readResultsPage(source, provider, attempted, signal);
    event('search', { type: 'provider-page', query, status: source.status, kind: read.kind });
    if (read.kind === 'challenge' && provider.challenge && jev) {
      source = await solveImageChallenge({
        page: source,
        settings: provider.challenge.settings,
        web,
        jev,
        signal,
        receive: (u) => event('challenge', { type: 'jev', ...u }),
      });
      read = readResultsPage(source, provider, attempted, signal);
      event('search', { type: 'recovered-page', status: source.status, kind: read.kind });
      if (source.status !== 200)
        throw new SearchError(
          'SEARCH_CHALLENGE',
          `the page after the challenge answered ${source.status}`,
        );
    }
    if (read.kind === 'results') return read.candidates;
    if (read.kind === 'empty') return [];
    throw new SearchError(
      read.kind === 'challenge' ? 'SEARCH_CHALLENGE' : 'SEARCH_PAGE',
      read.kind === 'challenge'
        ? 'the image challenge was not solved'
        : `the ${provider.id} page has neither results nor its empty marker`,
    );
  };

  const rank = async (
    query: string,
    candidates: Candidate[],
    maxResults: number,
  ): Promise<string[]> => {
    if (!candidates.length) return [];
    const known = new Set(candidates.map((c) => c.id));
    const answer = await calls.agent({
      job: 'rank',
      instructions: RANK_INSTRUCTIONS,
      schema: RankSchema,
      steps: profile.rankSteps,
      input: JSON.stringify({
        instruction: request.instruction,
        query,
        asOf: request.asOf ?? null,
        results: candidates,
        maxResults,
        observations: destinations.map(observe),
        perDestination,
      }),
      validate: ({ rankedIds }) => {
        const unknown = rankedIds.filter((id) => !known.has(id));
        const repeated = [...new Set(rankedIds.filter((id, i) => rankedIds.indexOf(id) !== i))];
        const over = rankedIds.length > maxResults;
        return unknown.length || repeated.length || over
          ? rankRetry({ unknown, repeated, max: maxResults, over })
          : null;
      },
    });
    if (!answer)
      throw new SearchError('SEARCH_RANKING_FAILED', 'the ranking gave no valid id list');
    return answer.rankedIds;
  };

  const rewrite = async (): Promise<string | null> => {
    const answer = await calls.agent({
      job: 'rewrite',
      instructions: REWRITE_INSTRUCTIONS,
      schema: RewriteSchema,
      steps: profile.rewriteSteps,
      input: JSON.stringify({
        instruction: request.instruction,
        queries,
        observations: destinations.map(observe),
        asOf: request.asOf ?? null,
      }),
      validate: ({ query }) =>
        query !== null && queries.includes(query) ? rewriteRetry(query) : null,
    });
    if (!answer) throw new SearchError('SEARCH_REWRITE_FAILED', 'the rewrite gave no valid query');
    return answer.query;
  };

  const visit = async (candidate: Candidate) => {
    attempted.add(candidate.url);
    selected.push(candidate);
    let result: DiscoveryResult | null = null;
    let error: string | null = null;
    try {
      result = await run(
        {
          url: candidate.url,
          instruction: request.instruction,
          outputSchema: page.outputSchema,
          allowLinkFollowing: page.allowLinkFollowing,
          linkDepth: page.linkDepth,
        },
        {
          groqKey: options.groqKey,
          typesafeKey: options.typesafeKey ?? null,
          profile: { ...profile.discovery, maxPages: page.maxPages },
          web,
          signal,
        },
      );
    } catch (cause) {
      if (signal.aborted) throw cause;
      error =
        cause instanceof WalkError
          ? `${cause.code} ${cause.message}`
          : String((cause as Error)?.message ?? cause);
    }
    const status: Observation['status'] = result?.status ?? 'failed';
    const reason = result ? result.reason : error;
    destinations.push({
      source: candidate,
      status,
      artifact: result?.artifact ?? null,
      trial: result?.trial ?? null,
      execution: result?.data ?? null,
      usable: status === 'ready',
      feedback: {
        status,
        reason,
        trialError: result?.trial?.error ?? null,
        findings: result?.findings ?? [],
      },
      usage: result?.usage ?? {},
    });
    event('destination', { type: 'destination', url: candidate.url, status, reason });
  };

  try {
    let query = request.query ?? request.instruction;
    for (let round = 0; ; round++) {
      queries.push(query);
      let candidates: Candidate[];
      let rankedIds: string[];
      try {
        candidates = await acquire(query);
        rankedIds = await rank(query, candidates, maxFollow - selected.length);
      } catch (error) {
        if (round === 0 || signal.aborted || !usableCount()) throw error;
        continuationError = {
          phase: 'search',
          error: { code: codeOf(error), message: String((error as Error)?.message ?? error) },
        };
        break;
      }
      attempts.push({ query, candidates, rankedIds });
      const byId = new Map(candidates.map((c) => [c.id, c]));
      for (const id of rankedIds) {
        if (selected.length >= maxFollow) break;
        const candidate = byId.get(id);
        if (candidate) await visit(candidate);
      }
      if (!(selected.length < maxFollow && rewritesLeft > 0 && usableCount() < minimum)) break;
      rewritesLeft--;
      let next: string | null;
      try {
        next = await rewrite();
      } catch (error) {
        if (signal.aborted || !usableCount()) throw error;
        continuationError = {
          phase: 'rewrite',
          error: { code: codeOf(error), message: String((error as Error)?.message ?? error) },
        };
        break;
      }
      if (next === null) break;
      query = next;
    }
  } catch (error) {
    if (error instanceof DiscoveryStop)
      throw new SearchError(
        error.kind === 'blocked' ? 'SEARCH_BLOCKED' : 'SEARCH_TOKEN_CAP',
        error.message,
      );
    throw error;
  } finally {
    ownWeb?.close();
  }
  return {
    instruction: request.instruction,
    attempts,
    selected,
    successfulSources: usableCount(),
    insufficient: usableCount() < minimum,
    destinations,
    continuationError,
    usage,
  };
};
