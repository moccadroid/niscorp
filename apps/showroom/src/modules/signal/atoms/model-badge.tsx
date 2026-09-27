import type { FC } from 'react';
import { Chip } from '@showroom/chrome/stage/ui';

// Says which model a demo is talking to: the visitor's own (a stored key) or the
// scripted provider — the same signal code, with only the network replaced.
export const ModelBadge: FC<{ scripted: boolean; note?: string }> = ({ scripted, note }) => (
  <div style={{ maxWidth: 960, margin: '12px auto 0', padding: '0 24px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#4b5563' }}>
    <Chip tone={scripted ? 'accent' : 'ok'}>{scripted ? 'scripted model — no key needed' : 'live model'}</Chip>
    <span>
      {scripted
        ? note ?? 'No API key: the real signal code runs against a scripted provider. Add a key in Signal → Settings to run it live.'
        : 'Running against your provider, with your key.'}
    </span>
  </div>
);
