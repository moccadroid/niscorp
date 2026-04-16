import type { FC } from 'react';
import { Cursor, FinalBadge, Placeholder, type PathStatus } from '@showroom/modules/solid/atoms';
import type { SearchData } from './search-results.demo';

type Props = { value: SearchData; pathStatuses: Map<string, PathStatus> };

const RelevanceBar: FC<{ value: number }> = ({ value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2 }}>
      <div
        style={{
          height: '100%',
          borderRadius: 2,
          transition: 'width 200ms',
          width: `${value * 100}%`,
          background: value > 0.9 ? '#22c55e' : value > 0.7 ? '#eab308' : '#94a3b8',
        }}
      />
    </div>
    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
      {(value * 100).toFixed(0)}%
    </span>
  </div>
);

export const SearchResultsView: FC<Props> = ({ value, pathStatuses }) => {
  const answerFinal = pathStatuses.get('answer')?.isFinal ?? false;
  const queryFinal = pathStatuses.get('query')?.isFinal ?? false;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div
        style={{
          padding: '10px 16px',
          background: '#ffffff',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          marginBottom: 12,
          fontSize: 14,
          color: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: '#94a3b8' }}>Q</span>
        {value.query || <Placeholder width={250} />}
        {value.query !== '' && !queryFinal && <Cursor />}
      </div>

      {value.results.map((result, i) => {
        const isFinal = pathStatuses.get(`results.${i}`)?.isFinal ?? false;
        return (
          <div
            key={i}
            style={{
              padding: '14px 16px',
              background: '#ffffff',
              borderRadius: 8,
              border: `1px solid ${isFinal ? '#86efac' : '#e2e8f0'}`,
              marginBottom: 8,
              transition: 'border-color 300ms',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2563eb' }}>
                  {result.title || <Placeholder width={200} />}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {result.url || <Placeholder width={150} />}
                </div>
              </div>
              <FinalBadge done={isFinal} />
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.6 }}>
              {result.snippet || <Placeholder width={300} />}
              {!isFinal && result.snippet !== '' && <Cursor />}
            </div>
            {result.relevance > 0 && (
              <div style={{ marginTop: 8 }}>
                <RelevanceBar value={result.relevance} />
              </div>
            )}
          </div>
        );
      })}

      {(value.answer !== '' || answerFinal) && (
        <div
          style={{
            padding: '14px 16px',
            background: '#f0fdf4',
            borderRadius: 8,
            border: '1px solid #86efac',
            marginTop: 4,
            fontSize: 13,
            color: '#166534',
            lineHeight: 1.6,
          }}
        >
          <span style={{ fontWeight: 600 }}>Summary: </span>
          {value.answer}
          {!answerFinal && value.answer !== '' && <Cursor />}
        </div>
      )}
    </div>
  );
};
