import { Animation, Image, ImageType } from 'imagescript';
import { z } from 'zod';
import { freezeOwned } from '../../engine/json.js';
import { HttpSourceSchema, readSourceBody, type HttpSource } from '../../web/source.js';
import { ChallengeSchema, type ImageChallenge, type PreparedImages } from './contracts.js';
import defaults from './imagescript-profile.json' with { type: 'json' };

const channel = z.number().int().min(0).max(255);
export const ImageScriptProfileSchema = z
  .object({
    formats: z.array(z.enum(['png', 'jpeg'])).min(1),
    minimumWidth: z.number().int().positive(),
    minimumHeight: z.number().int().positive(),
    background: z
      .object({ r: channel, g: channel, b: channel, alpha: z.number().min(0).max(1) })
      .strict(),
    maxInputBytes: z.number().int().positive(),
    maxInputPixels: z.number().int().positive(),
    maxOutputPixels: z.number().int().positive(),
    maxOutputBytes: z.number().int().positive(),
    png: z
      .object({
        compression: z.number().int().min(0).max(9),
        metadata: z.object({ creationTime: z.number().finite(), software: z.string() }).strict(),
      })
      .strict(),
  })
  .strict();
export const imageScriptProfile = freezeOwned(ImageScriptProfileSchema.parse(defaults));

/** Optional host codec: center-pad without resizing, preserving original tile IDs. */
export const createImageScriptPreparer = (
  input: unknown = defaults,
): ((
  challenge: ImageChallenge,
  images: HttpSource[],
  signal: AbortSignal,
) => Promise<PreparedImages>) => {
  const policy = freezeOwned(ImageScriptProfileSchema.parse(input));
  return async (inputChallenge, inputImages, signal): Promise<PreparedImages> => {
    signal.throwIfAborted();
    const challenge = ChallengeSchema.parse(inputChallenge);
    const images = z.array(HttpSourceSchema).parse(inputImages);
    if (
      images.length !== challenge.tiles.length ||
      new Set(challenge.tiles.map((tile) => tile.id)).size !== challenge.tiles.length
    )
      throw new Error('IMAGE_PREPARATION_IDENTITY: expected one source per unique tile');
    const entries: [string, PreparedImages[string]][] = [];
    for (const [index, tile] of challenge.tiles.entries()) {
      signal.throwIfAborted();
      const source = images[index];
      if (!source || source.url !== tile.url || source.status !== 200)
        throw new Error('IMAGE_PREPARATION_SOURCE: tile needs its matching HTTP 200 source');
      if (source.body.bytes > policy.maxInputBytes)
        throw new Error('IMAGE_PREPARATION_INPUT_BYTES');
      const bytes = readSourceBody(source);
      const format = ImageType.getType(bytes);
      if (!policy.formats.some((allowed) => allowed === format))
        throw new Error('IMAGE_PREPARATION_UNSUPPORTED_FORMAT: expected configured PNG or JPEG');
      const frames = await Animation.decode(bytes, {
        maxPixels: policy.maxInputPixels,
      });
      signal.throwIfAborted();
      const image = frames[0];
      if (frames.length !== 1 || !image)
        throw new Error('IMAGE_PREPARATION_DIMENSIONS: one complete image per tile required');
      const width = Math.max(policy.minimumWidth, image.width);
      const height = Math.max(policy.minimumHeight, image.height);
      if (width * height > policy.maxOutputPixels)
        throw new Error('IMAGE_PREPARATION_OUTPUT_PIXELS');
      const left = Math.floor((width - image.width) / 2),
        top = Math.floor((height - image.height) / 2);
      const { r, g, b, alpha } = policy.background;
      const canvas = new Image(width, height).fill(Image.rgbaToColor(r, g, b, alpha * 255));
      // Copy instead of blending so transparent source pixels also remain unchanged.
      for (let row = 0; row < image.height; row++) {
        signal.throwIfAborted();
        canvas.bitmap.set(
          image.bitmap.subarray(row * image.width * 4, (row + 1) * image.width * 4),
          ((top + row) * width + left) * 4,
        );
      }
      const output = await canvas.encode(policy.png);
      signal.throwIfAborted();
      if (output.length > policy.maxOutputBytes) throw new Error('IMAGE_PREPARATION_OUTPUT_BYTES');
      entries.push([
        tile.id,
        { format: 'png', data_base64: Buffer.from(output).toString('base64') },
      ]);
    }
    return Object.fromEntries(entries);
  };
};
