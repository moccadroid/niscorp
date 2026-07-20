// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Text, TextPropsSchema } from '../../../src/adapters/react/components';
import { createHarness } from './helpers';

describe('Text', () => {
  it('renders a span by default with md size and normal weight', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Text>hello</Text>
      </Wrapper>,
    );
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('hello');
    expect(span?.style.fontSize).toBe('14px');
    expect(span?.style.fontWeight).toBe('400');
  });

  it('renders the chosen `as` element with size, weight and color', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Text as="h2" size="2xl" weight="bold" color="red">
          title
        </Text>
      </Wrapper>,
    );
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe('title');
    expect(h2?.style.fontSize).toBe('24px');
    expect(h2?.style.fontWeight).toBe('700');
    expect(h2?.style.color).toBe('red');
  });

  it('schema accepts valid props', () => {
    expect(
      TextPropsSchema.safeParse({ as: 'p', size: 'lg', weight: 'medium', color: '#fff' }).success,
    ).toBe(true);
  });

  it('schema rejects invalid enum values', () => {
    expect(TextPropsSchema.safeParse({ as: 'div' }).success).toBe(false);
    expect(TextPropsSchema.safeParse({ size: 'huge' }).success).toBe(false);
  });

  it('has static meta', () => {
    expect(Text.meta?.description).toBeTruthy();
    expect(Text.meta?.propsSchema).toBe(TextPropsSchema);
  });
});
