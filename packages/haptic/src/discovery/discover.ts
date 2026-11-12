import { currentStamp } from '../artifact/grammar.js';
import { z } from 'zod';
import { ArtifactError, prepareArtifact, type PreparedArtifact } from '../artifact/prepare.js';
import type { Artifact, Policy } from '../artifact/schema.js';
import { fetchPage, walk, WalkError, type Redirect, type WalkResult } from '../artifact/walk.js';
import { createWebTransport, type WebTransport } from '../web/transport.js';
import type { HttpSource } from '../web/source.js';
import { runAttempt, type AttemptReport, type DiscoveryRequest } from './attempt.js';
import {
  createCalls,
  type Calls,
  type DiscoveryEvent,
  type TokenBudget,
  type Usage,
} from './calls.js';
import { isCountFinding } from './findings.js';
import type { ProviderBlock } from './model-transport.js';
import { DiscoveryProfileSchema, type DiscoveryProfileInput, type Effort } from './profile.js';

export const DiscoverRequestSchema = z
  .object({
    url: z.url(),
    instruction: z.string().min(1),
    outputSchema: z
      .record(z.string(), z.unknown())
      .nullable()
      .default(null)
      .describe(
        'JSON Schema of the result; without it the result has one property per field the reader cited.',
      ),
    allowLinkFollowing: z.boolean().default(false),
    linkDepth: z.number().int().positive().default(1),
  })
  .strict();
export type DiscoverRequestInput = z.input<typeof DiscoverRequestSchema>;

export type DiscoverOptions = {
  groqKey: string;
  // Without it, records are not labelled and long pages are cut at the budget instead of read by section.
  typesafeKey?: string | null;
  profile?: DiscoveryProfileInput;
  signal?: AbortSignal;
  // Where pages come from: saved pages (tests, benchmarks) or a web; by default a web with the default profile.
  pages?: (url: string) => Promise<HttpSource>;
  web?: WebTransport;
  // Replaces the model calls of each attempt (replay tests).
  calls?: (effort: Effort, attempt: number) => Calls;
};

export type AttemptSummary = {
  effort: Effort;
  status: AttemptReport['status'];
  reason: string | null;
  findings: string[];
  inputTokens: number;
  elapsedMs: number;
};

// The artifact's run before discovery calls it ready.
export type Trial = {
  visited: string[];
  redirects: Redirect[];
  limited: boolean;
  emptyPages: string[];
  error: string | null;
};

export type DiscoveryResult = {
  status: 'ready' | 'unresolved' | 'blocked';
  reason: string | null;
  artifact: Artifact | null;
  // The trial's data.
  data: unknown;
  trial: Trial | null;
  findings: string[];
  // What the instruction became on each linked level.
  next: string[];
  attempts: AttemptSummary[];
  usage: Usage;
  inputTokens: number;
  elapsedMs: number;
  blocked: ProviderBlock | null;
  events: DiscoveryEvent[];
};

const serious = (report: AttemptReport) => report.findings.filter((f) => !isCountFinding(f));
// A stop, or a finding other than the reader's count, runs discovery again at the next effort.
const escalates = (report: AttemptReport) =>
  report.status !== 'ready' || serious(report).length > 0;
// Ready before stopped; then fewer missing or lost cited examples; then fewer other findings.
const rank = (report: AttemptReport) =>
  report.status !== 'ready'
    ? [1, 0, 0]
    : [0, serious(report).filter((f) => /^example /.test(f)).length, serious(report).length];
const better = (a: AttemptReport, b: AttemptReport) => {
  const [x, y] = [rank(a), rank(b)];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};

const total = (usage: Usage) => Object.values(usage).reduce((sum, u) => sum + u.input, 0);
const isEmpty = (data: unknown) =>
  data == null ||
  (Array.isArray(data)
    ? data.length === 0
    : typeof data === 'object' && Object.keys(data).length === 0);

// One instruction and one address in, an artifact out: attempts at rising effort, the best attempt kept, and its
// artifact run once with no model before it is called ready.
export const discover = async (
  requestInput: DiscoverRequestInput,
  options: DiscoverOptions,
): Promise<DiscoveryResult> => {
  const started = Date.now();
  const request = DiscoverRequestSchema.parse(requestInput);
  const profile = DiscoveryProfileSchema.parse(options.profile ?? {});
  const signal = AbortSignal.any([
    options.signal ?? new AbortController().signal,
    AbortSignal.timeout(profile.discoveryTimeoutMs),
  ]);
  const policy: Policy = {
    maxPages: profile.maxPages,
    maxRedirects: profile.maxRedirects,
    stripFragments: true,
    accept: { statuses: [200] },
  };
  const ownWeb = options.pages || options.web ? null : createWebTransport();
  const web = options.web ?? ownWeb;
  const fetched = new Map<string, Promise<HttpSource>>();
  // Attempts read each page once; the trial fetches again.
  const pages =
    options.pages ??
    ((url: string) => {
      if (!fetched.has(url)) fetched.set(url, fetchPage(web as WebTransport, url, policy, signal));
      return fetched.get(url) as Promise<HttpSource>;
    });
  const attemptRequest: DiscoveryRequest = {
    url: request.url,
    instruction: request.instruction,
    outputSchema: request.outputSchema,
    linkDepth: request.allowLinkFollowing ? request.linkDepth : 0,
  };
  const budget: TokenBudget = { used: 0, cap: profile.maxInputTokens };
  const usage: Usage = {};
  const events: DiscoveryEvent[] = [];
  const attempts: { effort: Effort; report: AttemptReport; usage: Usage; elapsedMs: number }[] = [];
  try {
    for (const [index, effort] of profile.efforts.entries()) {
      const attemptStarted = Date.now();
      const attemptUsage: Usage = {};
      const calls =
        options.calls?.(effort, index) ??
        createCalls({
          groqKey: options.groqKey,
          typesafeKey: options.typesafeKey ?? null,
          profile,
          effort,
          budget,
          signal,
          usage: attemptUsage,
          events,
        });
      events.push({ job: 'attempt', at: Date.now(), event: { type: 'attempt', effort } });
      const report = await runAttempt({ request: attemptRequest, pages, calls, profile, signal });
      attempts.push({
        effort,
        report,
        usage: attemptUsage,
        elapsedMs: Date.now() - attemptStarted,
      });
      for (const [job, u] of Object.entries(attemptUsage)) {
        const sum = (usage[job] ??= { runs: 0, steps: 0, input: 0, output: 0, elapsedMs: 0 });
        for (const key of Object.keys(sum) as (keyof typeof sum)[]) sum[key] += u[key];
      }
      if (report.stop || !escalates(report)) break;
    }
    const chosen = attempts
      .slice(1)
      .reduce(
        (best, attempt) => (better(attempt.report, best.report) ? attempt : best),
        attempts[0] as (typeof attempts)[number],
      );
    const summary = attempts.map(({ effort, report, usage: u, elapsedMs }): AttemptSummary => ({
      effort,
      status: report.status,
      reason: report.reason,
      findings: report.findings,
      inputTokens: total(u),
      elapsedMs,
    }));
    const result = (
      status: DiscoveryResult['status'],
      reason: string | null,
      artifact: Artifact | null,
      data: unknown,
      trial: Trial | null = null,
    ): DiscoveryResult => ({
      status,
      reason,
      artifact,
      data,
      trial,
      findings: chosen.report.findings,
      next: chosen.report.next,
      attempts: summary,
      usage,
      inputTokens: total(usage),
      elapsedMs: Date.now() - started,
      blocked: chosen.report.stop?.block ?? null,
      events,
    });
    const { report } = chosen;
    if (report.status !== 'ready' || !report.program || !report.outputSchema)
      return result(report.status, report.reason, null, null);
    const draft = {
      stamp: currentStamp,
      policy,
      stages: report.stages,
      mapping: report.program,
      outputSchema: report.outputSchema,
    };
    let prepared: PreparedArtifact;
    try {
      prepared = prepareArtifact(draft);
    } catch (error) {
      return result(
        'unresolved',
        `the artifact does not prepare: ${(error as ArtifactError).message}`,
        null,
        null,
      );
    }
    // The trial: the artifact alone, with no model, on freshly fetched pages. Ready when it runs without an error and
    // returns data (any data when the caller gave the schema). Pages of the last level without records are reported.
    let run: WalkResult;
    try {
      run = await walk(
        prepared,
        request.url,
        options.pages ? { signal, pages: options.pages } : { signal, web: web as WebTransport },
      );
    } catch (error) {
      const message =
        error instanceof WalkError
          ? `${error.code} ${error.message}`
          : String((error as Error)?.message ?? error);
      return result('unresolved', `the artifact run failed: ${message}`, prepared.artifact, null, {
        visited: [],
        redirects: [],
        limited: false,
        emptyPages: [],
        error: message,
      });
    }
    const trial: Trial = {
      visited: run.visited,
      redirects: run.redirects,
      limited: run.limited,
      emptyPages: run.emptyPages,
      error: null,
    };
    if (!request.outputSchema && isEmpty(run.data))
      return result(
        'unresolved',
        'the artifact run returned no data',
        prepared.artifact,
        run.data,
        trial,
      );
    return result('ready', null, prepared.artifact, run.data, trial);
  } finally {
    await ownWeb?.close();
  }
};
