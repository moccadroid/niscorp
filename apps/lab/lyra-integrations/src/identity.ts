import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

// Read per request, not at import: a check sets it after boot.
const verifyKey = (): string => process.env['LYRA_VERIFY_KEY'] ?? '';

// `personId` is set only for a caller the studio knows; a staff-only principal
// arrives with it empty.
export type Identity = { principal: string; studioId: string; personId: string; country: string; studioName: string; legalName: string; legalForm: string };

const fromB64url = (text: string): Buffer => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export const readIdentity = (
  c: { req: { header: (name: string) => string | undefined } },
  integration: string,
): Identity | undefined => {
  const keyB64 = verifyKey();
  if (keyB64 === '') return undefined;
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  const dot = token.indexOf('.');
  if (dot <= 0) return undefined;
  try {
    const body = fromB64url(token.slice(0, dot));
    const signature = fromB64url(token.slice(dot + 1));
    const key = createPublicKey({ key: fromB64url(keyB64), format: 'der', type: 'spki' });
    if (!cryptoVerify(null, body, key, signature)) return undefined;
    const parsed = JSON.parse(body.toString()) as { integration?: unknown; principal?: unknown; scope?: Record<string, unknown>; exp?: unknown };
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return undefined;
    if (parsed.integration !== integration || typeof parsed.principal !== 'string') return undefined;
    const scope = parsed.scope ?? {};
    return {
      principal: parsed.principal,
      studioId: String(scope['studioId'] ?? ''),
      personId: String(scope['personId'] ?? ''),
      country: String(scope['country'] ?? ''),
      studioName: String(scope['studioName'] ?? ''),
      legalName: String(scope['legalName'] ?? ''),
      legalForm: String(scope['legalForm'] ?? ''),
    };
  } catch {
    return undefined;
  }
};
