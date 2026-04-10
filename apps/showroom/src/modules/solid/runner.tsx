import type { FC } from 'react';
import { StreamDemoRunner } from './runners/stream-demo-runner';

type Props = { story: unknown };

export const Runner: FC<Props> = ({ story }) => <StreamDemoRunner story={story} />;
