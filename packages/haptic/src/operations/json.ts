import { z } from 'zod';
import type { Operation } from '../engine/contracts.js';
import { OperationFailure } from '../engine/control.js';
import { defineOperation } from '../engine/operation.js';
import { HttpSourceSchema, readSourceBody } from './http-source.js';

/** Read transport-decoded JSON bytes. Media admission belongs to the calling JSON flow. */
export const createJsonReadOperation = (maxJsonDepth: number): Operation =>
  defineOperation({
    maxJsonDepth,
    input: z.object({ source: HttpSourceSchema }).strict(),
    output: z.object({ url: z.url(), document: z.json() }).strict(),
    run({ source }, { signal }) {
      signal.throwIfAborted();
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(readSourceBody(source));
      } catch (error) {
        if (error instanceof TypeError)
          throw new OperationFailure('JSON_ENCODING', 'JSON source is not valid UTF-8');
        throw error;
      }
      try {
        const document: unknown = JSON.parse(text);
        signal.throwIfAborted();
        return { url: source.url, document };
      } catch (error) {
        if (error instanceof SyntaxError) throw new OperationFailure('JSON_PARSE', error.message);
        throw error;
      }
    },
  });
