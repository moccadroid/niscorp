// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Box, BoxPropsSchema } from '../../../src/adapters/react/components';
import { createHarness } from './helpers';

describe('Box', () => {
  it('renders a div with default zero styles', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Box>child</Box>
      </Wrapper>,
    );
    const div = container.querySelector('div');
    expect(div?.textContent).toBe('child');
    expect(div?.style.padding).toBe('0px');
    expect(div?.style.borderRadius).toBe('0');
  });

  it('honours padding, background, border, radius', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Box padding={8} background="#fafafa" border radius={6}>
          x
        </Box>
      </Wrapper>,
    );
    const div = container.querySelector('div');
    expect(div?.style.padding).toBe('8px');
    expect(div?.style.background).toBe('rgb(250, 250, 250)');
    expect(div?.style.borderRadius).toBe('6px');
    expect(div?.style.border).toContain('1px');
  });

  it('schema accepts and rejects', () => {
    expect(
      BoxPropsSchema.safeParse({ padding: 2, background: '#fff', border: true, radius: 4 }).success,
    ).toBe(true);
    expect(BoxPropsSchema.safeParse({ padding: -1 }).success).toBe(false);
  });

  it('has static meta', () => {
    expect(Box.meta?.description).toBeTruthy();
    expect(Box.meta?.propsSchema).toBe(BoxPropsSchema);
  });
});
