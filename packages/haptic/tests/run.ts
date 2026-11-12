await import('./render.test.js');
await import('./artifact.test.js');
await import('./artifact-formats.test.js');
await import('./discovery.test.js');
await import('./search-provider.test.js');
await import('./search-rounds.test.js');
await import('./image-challenge.test.js');
await import('./image-choice-primitives.test.js');
await import('./image-preparation.test.js');
await import('./html-reader.test.js');
await import('./html-charset-base.test.js');
await import('./http-raw-transport.test.js');
await import('./package-docs.test.js');
console.log(
  'Offline checks complete: no model, no network. They do not measure discovery accuracy (benchmarks/ does).',
);
