import { useState } from 'react';
import { createSignal } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { NoApiKey } from '@showroom/modules/signal/atoms';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';

// `signal.embed()` converts text to a dense vector. Same builder
// pattern — `createSignal('openai').model('text-embedding-3-small')`.
//
// Single string returns `number[]`. Array returns `number[][]`.
// Pass `{ dimensions: 256 }` to truncate the output.

export const provider = 'openai' as const;
export const model = 'text-embedding-3-small';
export const userInput = 'wireless noise-cancelling headphones';

const DEFAULTS = [
  'wireless noise-cancelling headphones',
  'bluetooth earbuds with microphone',
  'industrial pressure gauge calibration',
];

const cosine = (a: number[], b: number[]): number => {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

type Result = {
  texts: string[];
  dimensions: number;
  matrix: number[][];
  ms: number;
};

export const Demo = () => {
  const [texts, setTexts] = useState(DEFAULTS);
  const [result, setResult] = useState<Result | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const apiKey = getKey(provider);

  const run = async () => {
    if (!apiKey) return;
    setLoading(true);
    setError('');

    try {
      const client = createOpenAIClient(provider, apiKey);
      const embedder = createSignal(provider, { client })
        .apiKey(apiKey)
        .model(model);

      const t0 = performance.now();
      const vectors = await embedder.embed(texts);
      const ms = Math.round(performance.now() - t0);

      const matrix = texts.map((_, i) =>
        texts.map((_, j) => Math.round(cosine(vectors[i]!, vectors[j]!) * 1000) / 1000),
      );

      setResult({ texts, dimensions: vectors[0]!.length, matrix, ms });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!apiKey) return <NoApiKey provider={provider} />;

  return (
    <>
      <Pitch
        headline="Text to vectors. Vectors to similarity."
        body="Embed any text into a dense vector with one call. Compare vectors with cosine similarity to find what's related — no fine-tuning, no keyword matching, no regex. Same builder pattern as chat, different model."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
        {texts.map((t, i) => (
          <input
            key={i}
            value={t}
            onChange={(e) => {
              const next = [...texts];
              next[i] = e.target.value;
              setTexts(next);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border, #333)',
              background: 'var(--bg-input, #1a1a1a)',
              color: 'var(--text, #e0e0e0)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        ))}
        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent, #3b82f6)',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
            alignSelf: 'flex-start',
          }}
        >
          {loading ? 'Embedding...' : 'Embed & Compare'}
        </button>
        {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
        {result && (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ color: 'var(--text-muted, #888)', marginBottom: 8 }}>
              {result.dimensions} dimensions &middot; {result.ms}ms
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th />
                  {result.texts.map((t, i) => (
                    <th key={i} style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-muted, #888)', fontWeight: 400, textAlign: 'center', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.slice(0, 24)}{t.length > 24 ? '...' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.matrix.map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-muted, #888)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.texts[i]!.slice(0, 24)}{result.texts[i]!.length > 24 ? '...' : ''}
                    </td>
                    {row.map((score, j) => (
                      <td
                        key={j}
                        style={{
                          padding: '4px 8px',
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontSize: 13,
                          color: i === j ? 'var(--text-muted, #666)' : score > 0.8 ? '#22c55e' : score > 0.5 ? '#eab308' : '#ef4444',
                        }}
                      >
                        {score.toFixed(3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
