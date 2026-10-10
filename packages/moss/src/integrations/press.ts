import { z } from 'zod';
import type { Bundle } from './bundle';

// ── press, copied at intake ──────────────────────────────────
//
// A listing sells with images, and the store never fetches from a service at
// render time — a dead add-on degrades its screens (injection stays an
// attempt), never its listing. So the bytes cross ONCE, here: each declared
// path is fetched from the service through the same mapping the proxy uses,
// handed to the host's seam (`storePress`, ./feature.ts), and the URL the host
// answers with is what the row keeps.
//
// Refusal is whole-payload, like everything else at this gate: a dead path, a
// non-image answer, an image that does not arrive in time or is larger than
// one may be, a seam that throws — or press declared on a deployment with no
// seam to hold it — refuses the bundle with a sentence naming the path, and
// the last good import keeps serving.
//
// TWO BOUNDS ARE THIS MODULE'S OWN, because both are about what this process
// does while the bytes cross: how long it waits for one image, and how much of
// one it will hold in memory. How many images, and anything about what an
// image is, stay the seam's to refuse, and its refusal arrives here as any
// other.
//
// The stored NAME is the path under the prefix, deterministic per
// (integration, path): a re-import overwrites its own images rather than
// accumulating copies.

// Where a press image lands: the bytes of one image a bundle declared, in;
// the URL the store serves it from, out (`storePress` in the feature's
// configuration, ./feature.ts). Throwing refuses the bundle whole.
export type StorePress = (integrationId: string, name: string, bytes: Uint8Array, contentType: string) => Promise<string>;

export type PressResult = { ok: true; urls: string[] } | { ok: false; reasons: string[] };

export type PressDeps = {
  // Absent: a bundle that declares press is refused.
  store: StorePress | undefined;
  // How long one image may take to arrive, its answer and its bytes together.
  timeoutMs: number;
  // How large one image may be. Held to while it is read, not after.
  maxBytes: number;
  fetch?: typeof fetch;
};

// What kind of thing the service answered with, read off the header it sent:
// the media type alone, without its parameters. No header reads as nothing.
const MediaTypeSchema = z
  .string()
  .nullable()
  .transform((header) => (header ?? '').split(';')[0]?.trim() ?? '');

// The bytes of one answer, read no further than `maxBytes`. A body that is
// larger is given up on where it crosses the line: the rest is never asked
// for, and what was read is let go. `undefined` says it was too large.
const bytesWithin = async (response: Response, maxBytes: number): Promise<Uint8Array | undefined> => {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let held = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    held += next.value.byteLength;
    if (held > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(held);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
};

export const copyPress = async (bundle: Bundle, integrationId: string, serviceUrl: string, deps: PressDeps): Promise<PressResult> => {
  const declared = bundle.meta.press;
  if (declared.length === 0) return { ok: true, urls: [] };
  const { store } = deps;
  if (store === undefined) {
    return { ok: false, reasons: [`press: the bundle declares ${declared.length} image(s), and this deployment has no storePress seam to hold them`] };
  }
  const send = deps.fetch ?? fetch;
  const own = `/integrations/${integrationId}/`;
  const urls: string[] = [];
  for (const path of declared) {
    const rest = path.slice(own.length);
    try {
      // One signal for the answer and for its bytes: an image that trickles is
      // given up on as one that never starts is.
      const response = await send(`${serviceUrl.replace(/\/$/, '')}/${rest}`, { signal: AbortSignal.timeout(deps.timeoutMs) });
      if (!response.ok) return { ok: false, reasons: [`press "${path}": the service answered ${response.status}`] };
      const contentType = MediaTypeSchema.parse(response.headers.get('content-type'));
      if (!contentType.startsWith('image/')) {
        return { ok: false, reasons: [`press "${path}": answered "${contentType === '' ? 'nothing' : contentType}", which is not an image`] };
      }
      const bytes = await bytesWithin(response, deps.maxBytes);
      if (bytes === undefined) return { ok: false, reasons: [`press "${path}": larger than ${deps.maxBytes} bytes, which is as large as one image may be here`] };
      urls.push(await store(integrationId, rest, bytes, contentType));
    } catch (err) {
      return { ok: false, reasons: [`press "${path}": ${String(err)}`] };
    }
  }
  return { ok: true, urls };
};
