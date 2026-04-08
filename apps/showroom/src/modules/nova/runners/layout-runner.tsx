import type { FC, ReactElement } from 'react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/react';
import type { LayoutStory } from '../story-types';
import type { RuntimeView } from '../runtime-context';
import type { ExpectationResult } from '../../../lib/check-expectation';

type Props = { story: LayoutStory; bundle: RuntimeView };

const noop = (): void => {};

const renderBanner = (
  expected: boolean,
  result: ExpectationResult | undefined,
): ReactElement | null => {
  if (!expected || result === undefined) return null;
  if (result.ok) {
    return (
      <div
        style={{
          margin: '12px 24px 0',
          padding: '6px 12px',
          background: '#dcfce7',
          color: '#166534',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {'\u2713 All assertions passing.'}
      </div>
    );
  }
  return (
    <div
      style={{
        margin: '12px 24px 0',
        padding: '8px 12px',
        background: '#dc2626',
        color: '#ffffff',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        Assertion failures:
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {result.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
};

export const LayoutRunner: FC<Props> = ({ story, bundle }) => {
  if (bundle.registry === undefined) return null;
  const { registry, renderTree, expectationResult } = bundle;
  const hasExpected = story.expected !== undefined;

  return (
    <NovaRenderProvider registry={registry} dispatch={noop} publish={noop}>
      {renderBanner(hasExpected, expectationResult)}
      <div style={{ padding: 24 }}>
        <RenderTree nodes={renderTree} />
      </div>
    </NovaRenderProvider>
  );
};
