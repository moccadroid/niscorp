import type { FC } from 'react';
import type { Story } from '../story-types';

const LEGEND =
  'The story\u2019s definition JSON: the layout, action, or shellSetup that produced what you see in the canvas.';

const extractSource = (story: Story): unknown => {
  if (story.kind === 'layout') {
    return { layout: story.layout, data: story.data ?? {}, preloadLayouts: story.preloadLayouts };
  }
  if (story.kind === 'action') {
    return { action: story.action };
  }
  return {
    shellSetup: story.shellSetup.toString(),
    initialPushes: story.initialPushes,
    canvases: story.canvases,
  };
};

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
};

type Props = { story: Story };

export const SourceTab: FC<Props> = ({ story }) => {
  const data = extractSource(story);
  return (
    <div>
      <div
        style={{
          padding: '12px 16px',
          background: '#f3f4f6',
          color: '#4b5563',
          fontSize: 11,
          borderBottom: '1px solid #e5e7eb',
          fontStyle: 'italic',
        }}
      >
        {LEGEND}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 16,
          fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {stringify(data)}
      </pre>
    </div>
  );
};
