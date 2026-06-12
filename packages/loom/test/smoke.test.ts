import { describe, it, expect } from 'vitest';

import * as loom from '../src/index.js';
import * as loomReact from '../src/react/index.js';

describe('@niscorp/loom scaffolding', () => {
  it('resolves the core entry', () => {
    expect(loom).toBeTypeOf('object');
  });

  it('resolves the react entry', () => {
    expect(loomReact).toBeTypeOf('object');
  });
});
