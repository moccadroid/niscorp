import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { OperationFailure, RunControl } from '../engine/control.js';

export class HttpContentIntegrityError extends Error {
  constructor(
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'HttpContentIntegrityError';
  }
}

// Node checks maxOutputLength after producing a chunk. Reserve that final chunk
// too; even a rejected transform must fit its remaining work allowance.
const outputQuantum = 64;
const decompressors = new Map<string, typeof gunzipSync>([
  ['gzip', gunzipSync],
  ['x-gzip', gunzipSync],
  ['deflate', inflateSync],
  ['br', brotliDecompressSync],
]);
const decodeStage = (
  bytes: Uint8Array,
  coding: string,
  maximum: number,
  remaining: number,
): Uint8Array => {
  if (coding === 'identity') return bytes;
  const decompress = decompressors.get(coding);
  if (!decompress)
    throw new OperationFailure(
      'HTTP_CONTENT_ENCODING_UNSUPPORTED',
      'Unsupported content coding: ' + coding,
    );
  const maximumOutput = Math.min(maximum, remaining - outputQuantum);
  if (maximumOutput < 1) {
    throw new RunControl(
      'HTTP_DECODE_WORK_BUDGET',
      'Insufficient decoded work for a bounded native output chunk',
    );
  }
  try {
    return decompress(bytes, { chunkSize: outputQuantum, maxOutputLength: maximumOutput });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE') {
      const workLimited = maximumOutput < maximum;
      throw new RunControl(
        workLimited ? 'HTTP_DECODE_WORK_BUDGET' : 'HTTP_DECODE_BYTE_BUDGET',
        workLimited
          ? 'Aggregate decoded work exceeded its byte allowance'
          : 'Content decoding exceeded its byte cap',
      );
    }
    throw new HttpContentIntegrityError('HTTP_CONTENT_DECODING_INVALID', { cause: error });
  }
};
export const decodeHttpContent = (
  encoded: Uint8Array,
  encodings: readonly string[],
  maximum: number,
  maximumWork: number,
): Uint8Array => {
  let bytes = encoded,
    producedBytes = 0;
  const charge = (): void => {
    if (bytes.byteLength > maximumWork - producedBytes) {
      throw new RunControl(
        'HTTP_DECODE_WORK_BUDGET',
        'Aggregate decoded work exceeded its byte allowance',
      );
    }
    producedBytes += bytes.byteLength;
  };
  for (const value of [...encodings].reverse()) {
    bytes = decodeStage(bytes, value.trim().toLowerCase(), maximum, maximumWork - producedBytes);
    charge();
    if (bytes.byteLength > maximum)
      throw new RunControl('HTTP_DECODE_BYTE_BUDGET', 'Content decoding exceeded its byte cap');
  }
  if (!encodings.length) charge();
  if (bytes.byteLength > maximum)
    throw new RunControl('HTTP_DECODE_BYTE_BUDGET', 'Content decoding exceeded its byte cap');
  return bytes;
};
