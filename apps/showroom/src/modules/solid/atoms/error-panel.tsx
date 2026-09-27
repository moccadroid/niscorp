import type { FC } from 'react';
import type { StreamError } from '@niscorp/solid';
import { INK, MONO } from '@showroom/chrome/stage/ui';

// Renders a `stream.onError(...)` log. Shape comes from solid's
// `StreamError` type: `{ phase, path, expected, received, message }`.

export const ErrorPanel: FC<{ errors: StreamError[] }> = ({ errors }) =>
  errors.length === 0 ? null : (
    <div style={{ borderRadius: 12, padding: '10px 14px', background: INK.warnWash, border: '1px solid #fde68a', maxHeight: 220, overflow: 'auto' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: INK.warn, marginBottom: 6 }}>
        {errors.length} value{errors.length === 1 ? '' : 's'} refused by the schema
      </div>
      {errors.map((err, i) => (
        <div key={i} style={{ padding: '3px 0', borderTop: i === 0 ? 'none' : '1px dashed #fde68a', fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5 }}>
          <span style={{ color: INK.warn, fontWeight: 600 }}>[{err.phase}]</span> <span style={{ color: INK.text }}>{err.path || '<root>'}</span>{' '}
          <span style={{ color: INK.soft }}>{err.expected === err.received ? err.message : `expected ${err.expected}, got ${err.received}`}</span>
        </div>
      ))}
    </div>
  );
