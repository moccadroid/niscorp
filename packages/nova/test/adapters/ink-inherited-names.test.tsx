import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { NovaRenderProvider, RenderTree } from '../../src/adapters/react';
import { defaultRegistry, ErrorMarker, fallback, TextWrap } from '../../src/adapters/ink';
import type { RenderNode } from '../../src/layout/types';

describe('ink kit — a colour named after an inherited property', () => {
  it('draws the text uncoloured', () => {
    const nodes: RenderNode[] = [{ type: 'component', name: 'Text', props: { color: 'constructor' }, children: [{ type: 'text', value: 'plain' }] }];
    const view = render(
      <NovaRenderProvider registry={defaultRegistry()} fallback={fallback} textWrapper={TextWrap} errorMarker={ErrorMarker} dispatch={() => undefined}>
        <RenderTree nodes={nodes} />
      </NovaRenderProvider>,
    );
    expect(view.lastFrame()).toBe('plain');
    view.unmount();
  });
});
