import type { FC } from 'react';
import { Btn, Chip, type Tone } from '@showroom/chrome/stage/ui';

// Start / Stop for a scripted stream, with its state as a chip. The stream is
// a recorded payload replayed on a timer — labelled so on every story.

export type DemoState = 'idle' | 'streaming' | 'done' | 'error';

const STATE: Record<DemoState, { tone: Tone; label: string }> = {
  idle: { tone: 'idle', label: 'not started' },
  streaming: { tone: 'warn', label: 'streaming…' },
  done: { tone: 'ok', label: 'closed' },
  error: { tone: 'bad', label: 'halted' },
};

export const StartStop: FC<{
  state: DemoState;
  onStart: () => void;
  onStop: () => void;
}> = ({ state, onStart, onStop }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
    <Btn kind="primary" onClick={onStart} disabled={state === 'streaming'} title={state === 'streaming' ? 'Already streaming — stop it first' : undefined}>
      {state === 'idle' ? 'Start the stream' : state === 'streaming' ? 'Streaming…' : 'Run it again'}
    </Btn>
    <Btn onClick={onStop} disabled={state !== 'streaming'} title={state !== 'streaming' ? 'Nothing is streaming' : 'Cut the stream here'}>
      Stop
    </Btn>
    <Chip tone={STATE[state].tone}>{STATE[state].label}</Chip>
    <Chip>simulated model · a recorded payload replayed in chunks</Chip>
  </div>
);
