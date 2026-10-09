import { z } from 'zod';
import type { StorePress } from '../manifest';
import type { Bundle } from './bundle';

// ── press, copied at intake ──────────────────────────────────
//
// A listing sells with images, and the store never fetches from a service at
// render time — a dead add-on degrades its screens (injection stays an
// attempt), never its listing. So the bytes cross ONCE, here: each declared
// path is fetched from the service through the same mapping the proxy uses,
// handed to the host's seam (NiscApp.storePress), and the URL the host
// answers with is what the row keeps.
//
// Refusal is whole-payload, like everything else at this gate: a dead path, a
// non-image answer, a seam that throws — or press declared on a deployment
// with no seam to hold it — refuses the bundle with a sentence naming the
// path, and the last good import keeps serving. The engine invents no bounds
// of its own: too big and too many are the seam's to refuse, and its refusal
// arrives here as any other.
//
// The stored NAME is the path under the prefix, deterministic per
// (integration, path): a re-import overwrites its own images rather than
// accumulating copies.

export type { StorePress };

export type PressResult = { ok: true; urls: string[] } | { ok: false; reasons: string[] };

// What kind of thing the service answered with, read off the header it sent:
// the media type alone, without its parameters. No header reads as nothing.
const MediaTypeSchema = z
  .string()
  .nullable()
  .transform((header) => (header ?? '').split(';')[0]?.trim() ?? '');

export const copyPress = async (
  bundle: Bundle,
  integrationId: string,
  serviceUrl: string,
  store: StorePress | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<PressResult> => {
  const declared = bundle.meta.press;
  if (declared.length === 0) return { ok: true, urls: [] };
  if (store === undefined) {
    return { ok: false, reasons: [`press: the bundle declares ${declared.length} image(s), and this deployment has no storePress seam to hold them`] };
  }
  const own = `/integrations/${integrationId}/`;
  const urls: string[] = [];
  for (const path of declared) {
    const rest = path.slice(own.length);
    try {
      const response = await fetchImpl(`${serviceUrl.replace(/\/$/, '')}/${rest}`);
      if (!response.ok) return { ok: false, reasons: [`press "${path}": the service answered ${response.status}`] };
      const contentType = MediaTypeSchema.parse(response.headers.get('content-type'));
      if (!contentType.startsWith('image/')) {
        return { ok: false, reasons: [`press "${path}": answered "${contentType === '' ? 'nothing' : contentType}", which is not an image`] };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      urls.push(await store(integrationId, rest, bytes, contentType));
    } catch (err) {
      return { ok: false, reasons: [`press "${path}": ${String(err)}`] };
    }
  }
  return { ok: true, urls };
};
