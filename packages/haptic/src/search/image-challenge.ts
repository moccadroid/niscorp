import { randomUUID } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { Signal } from '@niscorp/signal';
import type { WebTransport } from '../web/transport.js';
import { readSourceBody, type HttpSource } from '../web/source.js';
import { buildFormSubmission } from './image-choice/choices.js';
import type { ImageChallenge } from './image-choice/contracts.js';
import { readImageChallenge } from './image-choice/reader.js';
import type { ImageChallengeSettings } from './provider.js';

export class ChallengeError extends Error {
  constructor(
    readonly code: 'FORM' | 'ORIGIN' | 'STATUS' | 'REJECTED' | 'REDIRECTS' | 'JEV',
    message: string,
  ) {
    super(message);
  }
}

export type ChallengeUsage = { inputTokens: number; outputTokens: number };

const html = (source: HttpSource) => readSourceBody(source).toString('utf8');
const within = (url: string, origins: string[]) => origins.includes(new URL(url).origin);

// The fields of a form as the POST body, with the headers of the recorded request that DuckDuckGo accepted.
const post = async (
  web: WebTransport,
  url: string,
  fields: { name: string; value: string }[],
  referer: string,
  signal: AbortSignal,
) => {
  const body = new URLSearchParams();
  for (const field of fields) body.append(field.name, field.value);
  return web.post(
    url,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Encoding': 'identity',
      Origin: new URL(referer).origin,
      Referer: referer,
    },
    body.toString(),
    signal,
  );
};

// One image challenge, solved once: read the form, fetch and pad every tile, ask Jev one yes/no question per tile,
// post the chosen tiles, post the success form, follow its redirects. Returns the page the search continues from.
export const solveImageChallenge = async ({
  page,
  settings,
  web,
  jev,
  signal,
  receive,
}: {
  page: HttpSource;
  settings: ImageChallengeSettings;
  web: WebTransport;
  jev: Signal;
  signal: AbortSignal;
  receive?: (usage: ChallengeUsage) => void;
}): Promise<HttpSource> => {
  let challenge: ImageChallenge | null;
  try {
    challenge = readImageChallenge(html(page), page.url, settings);
  } catch (error) {
    throw new ChallengeError('FORM', (error as Error).message);
  }
  if (!challenge) throw new ChallengeError('FORM', 'no image challenge form on the page');

  const tiles: HttpSource[] = [];
  for (const tile of challenge.tiles) {
    if (!within(tile.url, settings.allowedImageOrigins))
      throw new ChallengeError('ORIGIN', `tile ${tile.id} is outside the allowed image origins`);
    const image = await web.get(tile.url, signal);
    if (image.status !== 200)
      throw new ChallengeError('STATUS', `tile ${tile.id} answered ${image.status}`);
    tiles.push(image);
  }
  const { createImageScriptPreparer } = await import('./image-choice/imagescript.js');
  const prepared = await createImageScriptPreparer()(challenge, tiles, signal);

  const images: Record<string, { type: 'base64'; mediaType: string; data: string }> = {};
  const references: Record<string, string> = {};
  for (const tile of challenge.tiles) {
    const image = prepared[tile.id];
    if (!image) throw new ChallengeError('FORM', `tile ${tile.id} was not prepared`);
    const reference = randomUUID();
    images[reference] = {
      type: 'base64',
      mediaType: `image/${image.format === 'jpg' ? 'jpeg' : image.format}`,
      data: image.data_base64,
    };
    references[tile.id] = reference;
  }
  const questions = Object.fromEntries(
    challenge.tiles.map((tile) => [
      tile.id,
      {
        type: 'noul' as const,
        instructions: settings.jev.question.replace('{id}', tile.id),
        criteria: { true: settings.jev.trueCriterion, false: settings.jev.falseCriterion },
      },
    ]),
  );
  let decisions: Record<string, { answer?: boolean }>;
  try {
    const result = await jev.decide({
      state: { instruction: challenge.instruction, tiles: references },
      questions,
      images,
      options: { signal: AbortSignal.any([signal, AbortSignal.timeout(settings.jev.maxMs)]) },
    });
    receive?.({
      inputTokens: result.meta.usage.inputTokens,
      outputTokens: result.meta.usage.outputTokens,
    });
    decisions = result.decisions as Record<string, { answer?: boolean }>;
  } catch (error) {
    throw new ChallengeError('JEV', String((error as Error)?.message ?? error));
  }
  const chosen = challenge.tiles.filter((tile) => decisions[tile.id]?.answer === true);

  const form = buildFormSubmission(challenge, chosen);
  if (!within(form.url, [...settings.allowedFormOrigins, ...settings.continuation.allowedOrigins]))
    throw new ChallengeError('ORIGIN', 'the challenge form posts outside the allowed origins');
  const submitted = await post(web, form.url, form.fields, challenge.pageUrl, signal);
  if (submitted.status !== 200)
    throw new ChallengeError('STATUS', `the challenge form answered ${submitted.status}`);

  const $ = cheerio.load(html(submitted));
  const success = $(settings.continuation.form);
  const action = success.attr('action');
  if (success.length !== 1 || success.attr('method')?.toUpperCase() !== 'POST' || !action)
    throw new ChallengeError(
      'REJECTED',
      'no success form after the challenge: the answer was not accepted',
    );
  const resumeUrl = new URL(action, submitted.url).href;
  if (!within(resumeUrl, settings.continuation.allowedOrigins))
    throw new ChallengeError('ORIGIN', 'the success form posts outside the allowed origins');
  const fields = success
    .find('input[name]')
    .toArray()
    .map((node) => ({ name: $(node).attr('name') ?? '', value: $(node).attr('value') ?? '' }));
  let current = await post(web, resumeUrl, fields, submitted.url, signal);

  for (let left = settings.continuation.maxRedirects; ; left--) {
    if (current.status === 200) return current;
    const location = current.headers.location?.[0]?.trim();
    if (!(settings.continuation.redirectStatuses as number[]).includes(current.status))
      throw new ChallengeError('STATUS', `the continuation answered ${current.status}`);
    if (left <= 0)
      throw new ChallengeError(
        'REDIRECTS',
        `more than ${settings.continuation.maxRedirects} redirects after the challenge`,
      );
    if (!location)
      throw new ChallengeError('STATUS', 'a redirect after the challenge has no location');
    const next = new URL(location, current.url).href;
    if (!within(next, settings.continuation.allowedOrigins))
      throw new ChallengeError(
        'ORIGIN',
        'a redirect after the challenge leaves the allowed origins',
      );
    current = await web.get(next, signal);
  }
};
