import assert from 'node:assert/strict';
import { MIMEType } from 'node:util';
import { load } from 'cheerio';
import { decodeHtmlSource } from '../dist/readers/html/index.js';
import { captureBody, readSourceBody } from '../dist/operations/http-source.js';

// Test-only DOM changes. Original captures and published artifacts remain unchanged.
export const mutateHtmlSource = (source, variant) => {
  const { html } = decodeHtmlSource(readSourceBody(source), source.headers);
  const $ = load(html);
  for (const change of variant.changes ?? []) {
    const selected = $(change.selector);
    assert(selected.length, 'HTML fixture change matched nothing: ' + change.selector);
    if (change.attribute) selected.attr(change.attribute, change.value);
    else selected.text(change.value);
  }
  for (const replacement of variant.replace ?? []) {
    const selected = $(replacement.selector);
    assert(selected.length, 'HTML fixture replacement matched nothing');
    selected.replaceWith(replacement.html);
  }
  for (const addition of variant.prepend ?? []) {
    const selected = $(addition.selector);
    assert(selected.length, 'HTML fixture insertion target missing');
    selected.prepend(addition.html);
  }
  for (const selector of variant.remove ?? []) {
    const selected = $(selector);
    assert(selected.length, 'HTML fixture removal matched nothing');
    selected.remove();
  }
  const body = captureBody(Buffer.from($.html()));
  const type = new MIMEType(source.headers['content-type'][0]);
  type.params.set('charset', 'utf-8');
  const headers = {
    ...source.headers,
    'content-type': [type.toString()],
    'content-length': [String(body.bytes)],
  };
  delete headers['content-encoding'];
  return { ...source, headers, encoded: body, body };
};
