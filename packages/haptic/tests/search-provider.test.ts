import assert from 'node:assert/strict';
import { duckduckgo } from '../src/search/duckduckgo.js';
import { readResultsPage } from '../src/search/provider.js';
import { captureBody, type HttpSource } from '../src/web/source.js';

const page = (html: string, status = 200): HttpSource => {
  const body = captureBody(new TextEncoder().encode(html));
  return {
    url: 'https://html.duckduckgo.com/html/?q=x',
    status,
    headers: { 'content-type': ['text/html; charset=utf-8'] },
    encoded: body,
    body,
  };
};
const wrapped = (address: string) =>
  `//duckduckgo.com/l/?uddg=${encodeURIComponent(address)}&rut=abc`;
const signal = AbortSignal.timeout(10_000);

// Destinations are unwrapped, fragments removed, each address kept once and none already attempted; a result
// without a title or address is dropped, not a failure of the page.
const results = page(`<div class="results">
  <div class="result"><a class="result__a" href="${wrapped('https://a.example/meetups#top')}">A meetups</a><a class="result__snippet">Monthly talks</a></div>
  <div class="result"><a class="result__a" href="${wrapped('https://a.example/meetups')}">A again</a></div>
  <div class="result"><a class="result__a" href="${wrapped('https://b.example/')}">B events</a></div>
  <div class="result"><a class="result__a">No address</a></div>
  <div class="result"><a class="result__a" href="https://c.example/direct">C direct</a></div>
</div>`);
const read = readResultsPage(results, duckduckgo, new Set(['https://b.example/']), signal);
assert.deepEqual(read, {
  kind: 'results',
  candidates: [
    { id: '0', title: 'A meetups', description: 'Monthly talks', url: 'https://a.example/meetups' },
    { id: '3', title: 'C direct', description: null, url: 'https://c.example/direct' },
  ],
});

assert.deepEqual(
  readResultsPage(page('<div class="no-results">No results.</div>'), duckduckgo, new Set(), signal),
  { kind: 'empty' },
);
assert.deepEqual(
  readResultsPage(
    page('<form id="challenge-form" method="POST"></form>', 202),
    duckduckgo,
    new Set(),
    signal,
  ),
  { kind: 'challenge' },
);
assert.deepEqual(readResultsPage(page('<p>Something else</p>'), duckduckgo, new Set(), signal), {
  kind: 'unknown',
});

console.log('search provider: results, empty, challenge, unknown');
