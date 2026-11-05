import { z } from 'zod';
import { load } from 'cheerio';
import {
  prepareArtifact,
  defineOperation,
  OperationFailure,
  type Operation,
  type Operations,
  type LimitsInput,
  type JsonObject,
} from '../../engine/index.js';
import { freezeOwned } from '../../engine/json.js';
import { HttpSourceSchema, readSourceBody } from '../../operations/http-source.js';
import { decodeHtmlSource, readHtmlProfile } from '../../readers/html/index.js';
import { readImageChallenge } from './reader.js';
import {
  buildVisionRequest,
  readVisionResponse,
  selectImageChoices,
  buildFormSubmission,
} from './choices.js';
import {
  ImageChoiceProfileSchema,
  ChallengeSchema,
  FormSchema,
  PreparedImagesSchema,
  VisionResponseSchema,
  type ImageChoiceProfile,
  type ImageChallenge,
  type PreparedImages,
} from './contracts.js';
import defaults from './default-profile.json' with { type: 'json' };
import workflow from './recovery.json' with { type: 'json' };

export { readImageChallenge } from './reader.js';
export {
  buildVisionRequest,
  readVisionResponse,
  selectImageChoices,
  buildFormSubmission,
} from './choices.js';
export { ImageChoiceProfileSchema } from './contracts.js';
export type { ImageChoiceProfile, ImageChallenge, PreparedImages } from './contracts.js';
export const imageChoiceProfile = freezeOwned(ImageChoiceProfileSchema.parse(defaults));
export const imageChoiceWorkflow = freezeOwned(workflow);
type Source = z.infer<typeof HttpSourceSchema>;
export type ImageChoiceAdapters = {
  operations: Operations;
  limits: LimitsInput;
  profile?: unknown;
  html?: unknown;
  prepareImages: (
    challenge: ImageChallenge,
    images: Source[],
    signal: AbortSignal,
  ) => Promise<PreparedImages>;
  decideImages: (
    request: JsonObject,
    policy: ImageChoiceProfile['jev'],
    signal: AbortSignal,
  ) => Promise<unknown>;
  postForm: (
    form: z.infer<typeof FormSchema>,
    policy: ImageChoiceProfile['transport'],
    signal: AbortSignal,
  ) => Promise<Source>;
};

// The existing interpreter owns ordering and branches. The host owns image/vision/POST adapters.
export const createImageChallengeRecovery = async (
  input: ImageChoiceAdapters,
): Promise<Operation> => {
  const profile = freezeOwned(ImageChoiceProfileSchema.parse(input.profile ?? defaults));
  const htmlProfile = readHtmlProfile(input.html);
  const { prepareImages, decideImages, postForm } = input;
  const getOperation = input.operations['http.get'],
    resolveOperation = input.operations['url.resolve'];
  if (!getOperation || !resolveOperation)
    throw new Error('Image recovery needs http.get and url.resolve operations');
  const get = getOperation.run.bind(getOperation);
  const common = { maxJsonDepth: input.limits.maxJsonDepth };
  const operations: Operations = {
    'url.resolve': resolveOperation,
    'image-choice.read': defineOperation({
      ...common,
      input: HttpSourceSchema,
      output: ChallengeSchema,
      run(source) {
        const challenge = readImageChallenge(
          decodeHtmlSource(readSourceBody(source), source.headers, htmlProfile).html,
          source.url,
          profile,
        );
        if (!challenge)
          throw new OperationFailure(
            'IMAGE_CHALLENGE_UNSUPPORTED',
            'No configured image-choice challenge form',
          );
        return challenge;
      },
    }),
    'image-choice.get': defineOperation({
      ...common,
      input: z.object({ url: z.url(), allowedOrigins: z.array(z.url()) }).strict(),
      output: HttpSourceSchema,
      async run(request, context) {
        if (!request.allowedOrigins.includes(new URL(request.url).origin))
          throw new OperationFailure(
            'IMAGE_CHALLENGE_ORIGIN',
            'Image recovery GET outside configured origins',
          );
        const source = HttpSourceSchema.parse(await get({ url: request.url }, context));
        if (source.url !== new URL(request.url).href)
          throw new Error('Recovery GET source URL mismatch');
        return source;
      },
    }),
    'image-choice.prepare': defineOperation({
      ...common,
      input: z.object({ challenge: ChallengeSchema, images: z.array(HttpSourceSchema) }).strict(),
      output: PreparedImagesSchema,
      async run(request, { signal }) {
        return prepareImages(request.challenge, request.images, signal);
      },
    }),
    'image-choice.vision': defineOperation({
      ...common,
      input: z.object({ challenge: ChallengeSchema, images: PreparedImagesSchema }).strict(),
      output: VisionResponseSchema,
      async run(request, { signal }) {
        const result = await decideImages(
          buildVisionRequest(request.challenge, request.images, profile.jev),
          profile.jev,
          signal,
        );
        signal.throwIfAborted();
        return readVisionResponse(result, request.challenge);
      },
    }),
    'image-choice.submission': defineOperation({
      ...common,
      input: z.object({ challenge: ChallengeSchema, response: VisionResponseSchema }).strict(),
      output: FormSchema,
      run(request) {
        const form = buildFormSubmission(
          request.challenge,
          selectImageChoices(request.challenge, request.response, profile.jev),
        );
        return { url: form.url, fields: form.fields, referer: request.challenge.pageUrl };
      },
    }),
    'image-choice.post': defineOperation({
      ...common,
      input: FormSchema,
      output: HttpSourceSchema,
      async run(form, { signal }) {
        if (
          ![...profile.allowedFormOrigins, ...profile.continuation.allowedOrigins].includes(
            new URL(form.url).origin,
          )
        )
          throw new OperationFailure(
            'IMAGE_CHALLENGE_ORIGIN',
            'Recovery POST outside configured origins',
          );
        const expectedUrl = new URL(form.url).href;
        const source = HttpSourceSchema.parse(
          await postForm(freezeOwned(form), profile.transport, signal),
        );
        signal.throwIfAborted();
        if (source.url !== expectedUrl) throw new Error('Recovery POST source URL mismatch');
        return source;
      },
    }),
    'image-choice.continuation': defineOperation({
      ...common,
      input: HttpSourceSchema,
      output: FormSchema,
      run(source) {
        const $ = load(decodeHtmlSource(readSourceBody(source), source.headers, htmlProfile).html),
          form = $(profile.continuation.form),
          action = form.attr('action');
        if (form.length !== 1 || form.attr('method')?.toUpperCase() !== 'POST' || !action)
          throw new OperationFailure(
            'IMAGE_CHALLENGE_REJECTED',
            'No observed success POST form; CAPTCHA acceptance not established',
          );
        const url = new URL(action, source.url);
        if (!profile.continuation.allowedOrigins.includes(url.origin))
          throw new OperationFailure(
            'IMAGE_CHALLENGE_ORIGIN',
            'Success form outside configured origins',
          );
        return FormSchema.parse({
          url: url.href,
          referer: source.url,
          fields: form
            .find('input[name]')
            .toArray()
            .map((node) => ({ name: $(node).attr('name'), value: $(node).attr('value') ?? '' })),
        });
      },
    }),
  };
  const prepared = await prepareArtifact(workflow, operations, input.limits);
  return defineOperation({
    ...common,
    input: HttpSourceSchema,
    output: HttpSourceSchema,
    async run(source, { signal }) {
      const outcome = await prepared.run({ source, profile }, { signal });
      signal.throwIfAborted();
      if (outcome.status !== 'completed')
        throw new OperationFailure(
          outcome.error?.code ?? 'IMAGE_CHALLENGE_FAILED',
          outcome.error?.message ?? 'Recovery did not complete',
        );
      return HttpSourceSchema.parse(outcome.value);
    },
  });
};
