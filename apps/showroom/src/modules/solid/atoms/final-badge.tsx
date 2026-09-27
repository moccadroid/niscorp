import type { FC } from 'react';
import { Chip } from '@showroom/chrome/stage/ui';

// Small chip showing '…' while a subtree is still streaming and 'final' once
// its `onFinal` has fired.

export const FinalBadge: FC<{ done: boolean }> = ({ done }) => <Chip tone={done ? 'ok' : 'idle'}>{done ? '✓ final' : '…'}</Chip>;
