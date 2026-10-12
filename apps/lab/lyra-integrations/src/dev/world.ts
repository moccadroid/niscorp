let failed = 0;

export const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!condition) failed += 1;
};

export const report = (what: string): never => {
  console.log(failed === 0 ? `\n\x1b[32mOK — ${what}\x1b[0m` : `\n\x1b[31mFAIL — ${failed} assertion(s).\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
};

import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

const b64url = (buffer: Buffer): string => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export type Deployment = {
  verifyKey: string;
  mint: (claims: { integration: string; principal: string; scope?: Record<string, unknown> }, ttlMs?: number) => string;
};

export const deployment = (): Deployment => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    verifyKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    mint: ({ integration, principal, scope = {} }, ttlMs = 30_000) => {
      const iat = Date.now();
      const body = Buffer.from(JSON.stringify({ integration, principal, scope, iat, exp: iat + ttlMs }));
      return `${b64url(body)}.${b64url(cryptoSign(null, body, privateKey))}`;
    },
  };
};
