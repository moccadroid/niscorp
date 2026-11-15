// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDomView } from '../../src/adapters/dom';
import { defaultRegistry } from '../../src/adapters/dom/components';
import { iconGlyph } from '../../src/adapters/tty/components';
import type { RenderNode } from '../../src/layout/types';

const drawn = (frame: RenderNode[]): HTMLElement => {
  const root = document.createElement('div');
  createDomView(root, defaultRegistry(), { frame: () => frame, canvasTree: () => [], dispatch: () => undefined, publish: () => undefined }).render();
  return root;
};

describe('a prop value named after an inherited property is not in a kit table', () => {
  it('an icon named after one is drawn as its name', () => {
    expect(iconGlyph('constructor')).toBe('constructor');
    expect(drawn([{ type: 'component', name: 'Button', props: { icon: 'constructor' }, children: [] }]).textContent).toBe('constructor');
  });

  it('an alignment named after one sets no alignment', () => {
    const root = drawn([{ type: 'component', name: 'Row', props: { align: 'constructor', justify: 'toString' }, children: [] }]);
    expect(root.innerHTML).toBe('<div style="display: flex; flex-direction: row;" data-component="Row"></div>');
  });
});
