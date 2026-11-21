import { SearchProviderSchema, type SearchProvider } from './provider.js';

export const duckduckgo: SearchProvider = SearchProviderSchema.parse({
  id: 'duckduckgo',
  query: { url: 'https://html.duckduckgo.com/html/', parameter: 'q' },
  accept: { statuses: [200, 202] },
  maxRedirects: 3,
  results: {
    kind: 'records',
    format: 'html',
    render: false,
    selector: '.result:has(.result__a)',
    fields: {
      title: { selector: '.result__a', attribute: null },
      url: { selector: '.result__a', attribute: 'href' },
      description: { selector: '.result__snippet', attribute: null },
    },
    required: ['title', 'url'],
    where: null,
    limit: null,
  },
  unwrap: { origin: 'https://duckduckgo.com', pathname: '/l/', parameter: 'uddg' },
  empty: '.no-results',
  challenge: {
    solver: 'image-choice',
    detect: '#challenge-form',
    settings: {
      form: '#challenge-form',
      instruction: '.anomaly-modal__instructions',
      tile: '.anomaly-modal__box',
      image: 'img.anomaly-modal__image',
      checkbox: 'input[type=checkbox]',
      submit: 'button[name=challenge-submit]',
      allowedFormOrigins: ['https://duckduckgo.com'],
      allowedImageOrigins: ['https://html.duckduckgo.com', 'https://lite.duckduckgo.com'],
      continuation: {
        form: '#success-form',
        allowedOrigins: ['https://duckduckgo.com', 'https://html.duckduckgo.com'],
        redirectStatuses: [302],
        maxRedirects: 3,
      },
      jev: {
        question:
          'Does the picture in `tiles.{id}` contain the object requested by the challenge instruction?',
        trueCriterion:
          'The requested object is visibly present in this tile, including a partially visible instance.',
        falseCriterion: 'The requested object is not visibly present in this tile.',
        maxMs: 120000,
      },
    },
  },
});
