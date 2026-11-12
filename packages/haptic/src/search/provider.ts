import * as cheerio from 'cheerio';
import { z } from 'zod';
import { RecordStageSchema } from '../artifact/schema.js';
import { readRecords } from '../artifact/stage.js';
import { readSourceBody, type HttpSource } from '../web/source.js';
import { ImageChoiceProfileSchema } from './image-choice/contracts.js';

// The image challenge: where its parts are on the page and the question Jev answers per tile.
export const ImageChallengeSettingsSchema = ImageChoiceProfileSchema.extend({
  jev: z
    .object({
      question: z.string().min(1).describe('"{id}" is replaced by the tile id.'),
      trueCriterion: z.string().min(1),
      falseCriterion: z.string().min(1),
      maxMs: z.number().int().positive(),
    })
    .strict(),
});

// A search site as data: where the query goes, how a results page is read, and how its empty page and its
// challenge page are recognised.
export const SearchProviderSchema = z
  .object({
    id: z.string().min(1),
    query: z.object({ url: z.url(), parameter: z.string().min(1) }).strict(),
    accept: z.object({ statuses: z.array(z.number().int()).min(1) }).strict(),
    maxRedirects: z.number().int().nonnegative(),
    results: RecordStageSchema.describe(
      'Fields title, url and description; url is read from href.',
    ),
    unwrap: z
      .object({ origin: z.url(), pathname: z.string().min(1), parameter: z.string().min(1) })
      .strict()
      .nullable()
      .describe(
        'A result address on this origin and path carries the destination in this query parameter.',
      ),
    empty: z.string().min(1).describe('CSS present only on a page with no results.'),
    challenge: z
      .object({
        solver: z.literal('image-choice'),
        detect: z.string().min(1),
        settings: ImageChallengeSettingsSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type SearchProvider = z.infer<typeof SearchProviderSchema>;
export type ImageChallengeSettings = z.infer<typeof ImageChallengeSettingsSchema>;

export type Candidate = { id: string; title: string; description: string | null; url: string };
export type ResultsPage =
  | { kind: 'results'; candidates: Candidate[] }
  | { kind: 'empty' }
  | { kind: 'challenge' }
  | { kind: 'unknown' };

const html = (source: HttpSource) => readSourceBody(source).toString('utf8');

const unwrapped = (address: string, unwrap: SearchProvider['unwrap']) => {
  if (!unwrap) return address;
  try {
    const url = new URL(address);
    if (url.origin !== new URL(unwrap.origin).origin || url.pathname !== unwrap.pathname)
      return address;
    return url.searchParams.get(unwrap.parameter) ?? address;
  } catch {
    return address;
  }
};

// What a provider page is: results (destinations unwrapped, fragments removed, each address once and not one
// already attempted), the empty page, a challenge, or something else.
export const readResultsPage = (
  source: HttpSource,
  provider: SearchProvider,
  attempted: ReadonlySet<string>,
  signal: AbortSignal,
): ResultsPage => {
  const $ = cheerio.load(html(source));
  if (provider.challenge && $(provider.challenge.detect).length) return { kind: 'challenge' };
  const records = readRecords(source, provider.results, signal);
  if (!records.length) return $(provider.empty).length ? { kind: 'empty' } : { kind: 'unknown' };
  const candidates: Candidate[] = [];
  const seen = new Set(attempted);
  for (const [index, record] of records.entries()) {
    const { title, url, description } = record.fields;
    if (typeof title !== 'string' || typeof url !== 'string') continue;
    const address = unwrapped(url, provider.unwrap).replace(/#.*$/, '');
    if (seen.has(address)) continue;
    seen.add(address);
    candidates.push({
      id: String(index),
      title,
      description: typeof description === 'string' ? description : null,
      url: address,
    });
  }
  return { kind: 'results', candidates };
};
