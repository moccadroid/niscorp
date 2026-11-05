// Host adapters for the optional image-choice recovery. No engine/browser dependency is added.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { defineOperation } from '../dist/index.js';
import { HttpSourceSchema, captureBody } from '../dist/operations/http-source.js';

export const createSearchRecoveryAdapter = ({ operations, limits, directory, apiKey, save }) => {
  let pending,
    posts = 0,
    recoveries = 0;
  return defineOperation({
    input: HttpSourceSchema,
    output: HttpSourceSchema,
    maxJsonDepth: limits.maxJsonDepth,
    async run(source, context) {
      const number = ++recoveries,
        started = performance.now();
      await save(`recovery-${number}-input.json`, source);
      console.log(
        JSON.stringify({ kind: 'recovery-start', number, url: source.url, status: source.status }),
      );
      pending ??= import('../dist/search/image-choice/index.js').then(async (module) => {
        await save('image-choice-profile.json', module.imageChoiceProfile);
        await save('image-choice-workflow.json', module.imageChoiceWorkflow);
        const { createImageScriptPreparer, imageScriptProfile } = await import(
          '../dist/search/image-choice/imagescript.js'
        );
        await save('image-preparation-profile.json', imageScriptProfile);
        return module.createImageChallengeRecovery({
          operations,
          limits,
          prepareImages: createImageScriptPreparer(),
          async decideImages(request, policy, signal) {
            const response = await fetch(policy.endpoint, {
              method: 'POST',
              headers: {
                ...policy.headers,
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + apiKey,
              },
              body: JSON.stringify(request),
              signal: AbortSignal.any([signal, AbortSignal.timeout(policy.maxMs)]),
            });
            // The outer audit saves the raw body before this adapter receives/parses it.
            const text = await response.text();
            if (response.status !== 200) throw new Error('Vision HTTP ' + response.status);
            return JSON.parse(text);
          },
          async postForm(form, policy, signal) {
            const number = ++posts;
            const body = new URLSearchParams();
            for (const field of form.fields) body.append(field.name, field.value);
            const headers = {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept-Encoding': 'identity',
              Origin: new URL(form.referer).origin,
              Referer: form.referer,
            };
            await save(`recovery-post-${number}-request.json`, {
              url: form.url,
              method: 'POST',
              headers,
              body: body.toString(),
            });
            // Use the same native HTTP client family as Haptic's GET adapter.
            // Unlike fetch, this does not add a different User-Agent or Accept header.
            const url = new URL(form.url),
              payload = body.toString();
            const response = await new Promise((resolve, reject) => {
              const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
                url,
                {
                  method: 'POST',
                  headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) },
                  signal: AbortSignal.any([signal, AbortSignal.timeout(policy.maxMs)]),
                },
                resolve,
              );
              request.once('error', reject);
              request.end(payload);
            });
            const parts = [];
            let bytes = 0;
            try {
              for await (const part of response) {
                signal.throwIfAborted();
                bytes += part.length;
                if (bytes > policy.maxResponseBytes)
                  throw new Error('Recovery POST response byte allowance exceeded');
                parts.push(part);
              }
            } finally {
              response.destroy();
            }
            const raw = Buffer.concat(parts);
            await writeFile(resolve(directory, `recovery-post-${number}-body.html`), raw);
            const responseHeaders = {};
            for (let i = 0; i < response.rawHeaders.length; i += 2) {
              const name = response.rawHeaders[i].toLowerCase();
              (responseHeaders[name] ??= []).push(response.rawHeaders[i + 1]);
            }
            await save(`recovery-post-${number}-response.json`, {
              status: response.statusCode,
              headers: responseHeaders,
              bytes,
            });
            if (
              response.headers['content-encoding'] &&
              response.headers['content-encoding'] !== 'identity'
            )
              throw new Error(
                'Host POST adapter requires identity content encoding for exact source capture',
              );
            const captured = captureBody(raw);
            return {
              url: form.url,
              status: response.statusCode,
              headers: responseHeaders,
              encoded: captured,
              body: captured,
            };
          },
        });
      });
      try {
        const result = await (await pending).run(source, context);
        const observation = {
          status: result.status,
          url: result.url,
          elapsedMs: performance.now() - started,
        };
        await save(`recovery-${number}-outcome.json`, observation);
        console.log(JSON.stringify({ kind: 'recovery-completed', number, ...observation }));
        return result;
      } catch (error) {
        await save(`recovery-${number}-outcome.json`, {
          error: { code: error.code, message: error.message },
          elapsedMs: performance.now() - started,
        });
        throw error;
      }
    },
  });
};
