// These ids are not secrets: where `crypto.randomUUID` is missing, a
// Math.random token stands in.

export type IdFactory = () => string;

type CryptoLike = { randomUUID?: () => string };

const fallbackToken = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const getCrypto = (): CryptoLike | undefined => {
  if (typeof globalThis === 'undefined') return undefined;
  const g: { crypto?: CryptoLike } = globalThis;
  return g.crypto;
};

export const createIdFactory = (prefix: string): IdFactory => {
  const cryptoObj = getCrypto();
  const randomUUID = cryptoObj?.randomUUID;
  if (typeof randomUUID === 'function') {
    return (): string => `${prefix}-${randomUUID.call(cryptoObj)}`;
  }
  return (): string => `${prefix}-${fallbackToken()}`;
};
