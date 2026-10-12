import type { FC } from 'react';
import { Chip } from '@showroom/chrome/stage/ui';

export const FinalBadge: FC<{ done: boolean }> = ({ done }) => <Chip tone={done ? 'ok' : 'idle'}>{done ? '✓ final' : '…'}</Chip>;
