import type { FC, ReactNode } from 'react';
import { Cursor, FinalBadge, Placeholder, type PathStatus } from '@showroom/modules/solid/atoms';
import type { SelectData } from './select-api.demo';

type Props = { value: SelectData; pathStatuses: Map<string, PathStatus> };

const SelectPanel: FC<{
  title: string;
  status: PathStatus | undefined;
  children: ReactNode;
}> = ({ title, status, children }) => {
  const isFinal = status?.isFinal ?? false;
  return (
    <div
      style={{
        padding: '12px 14px',
        background: '#ffffff',
        borderRadius: 8,
        border: `1px solid ${isFinal ? '#86efac' : '#e2e8f0'}`,
        transition: 'border-color 300ms',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <code
          style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, Menlo, monospace' }}
        >
          {title}
        </code>
        <FinalBadge done={isFinal} />
      </div>
      {children}
    </div>
  );
};

export const SelectApiView: FC<Props> = ({ value, pathStatuses }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      maxWidth: 640,
      margin: '0 auto',
    }}
  >
    <SelectPanel title="stream.select('header')" status={pathStatuses.get('header')}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
        {value.header.title || <Placeholder width={140} />}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
        {value.header.subtitle || <Placeholder width={180} />}
      </div>
      {value.header.badge !== '' && (
        <div
          style={{
            display: 'inline-block',
            marginTop: 8,
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            background: value.header.badge === 'positive' ? '#dcfce7' : '#fef3c7',
            color: value.header.badge === 'positive' ? '#166534' : '#92400e',
          }}
        >
          {value.header.badge}
        </div>
      )}
    </SelectPanel>

    <SelectPanel title="stream.select('details')" status={pathStatuses.get('details')}>
      {value.details.confidence > 0 ? (
        <>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
            {(value.details.confidence * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>confidence</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {value.details.categories.map((cat, i) => (
              <span
                key={i}
                style={{
                  padding: '2px 6px',
                  borderRadius: 3,
                  fontSize: 10,
                  background: '#eff6ff',
                  color: '#2563eb',
                  fontWeight: 500,
                }}
              >
                {cat}
              </span>
            ))}
          </div>
        </>
      ) : (
        <Placeholder width={80} />
      )}
    </SelectPanel>

    <div style={{ gridColumn: '1 / -1' }}>
      <SelectPanel title="stream.select('analysis')" status={pathStatuses.get('analysis')}>
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
          {value.analysis || <Placeholder width={300} />}
          {value.analysis !== '' && !pathStatuses.get('analysis')?.isFinal && <Cursor />}
        </div>
      </SelectPanel>
    </div>

    <div style={{ gridColumn: '1 / -1' }}>
      <SelectPanel title="stream.select('meta')" status={pathStatuses.get('meta')}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
          <span>
            Model: <b style={{ color: '#0f172a' }}>{value.meta.model || '…'}</b>
          </span>
          <span>
            Latency: <b style={{ color: '#0f172a' }}>{value.meta.latency || '…'}</b>
          </span>
          <span>
            Tokens: <b style={{ color: '#0f172a' }}>{value.meta.tokens || '…'}</b>
          </span>
        </div>
      </SelectPanel>
    </div>
  </div>
);
