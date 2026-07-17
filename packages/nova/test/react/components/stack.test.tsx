// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Stack, StackPropsSchema } from '../../../src/react/components';
import { createHarness } from './helpers';

describe('Stack', () => {
  it('renders children inside a flex div with default direction column', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Stack>
          <span>a</span>
          <span>b</span>
        </Stack>
      </Wrapper>,
    );
    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div?.style.display).toBe('flex');
    expect(div?.style.flexDirection).toBe('column');
    expect(div?.children.length).toBe(2);
  });

  it('honours direction=row, gap, padding, justify, align, wrap', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Stack direction="row" gap={8} padding={4} justify="between" align="center" wrap>
          <span>x</span>
        </Stack>
      </Wrapper>,
    );
    const div = container.querySelector('div');
    expect(div?.style.flexDirection).toBe('row');
    expect(div?.style.gap).toBe('8px');
    expect(div?.style.padding).toBe('4px');
    expect(div?.style.justifyContent).toBe('space-between');
    expect(div?.style.alignItems).toBe('center');
    expect(div?.style.flexWrap).toBe('wrap');
  });

  it('schema accepts a valid prop set', () => {
    const result = StackPropsSchema.safeParse({
      direction: 'row',
      gap: 4,
      align: 'center',
      justify: 'around',
      padding: 2,
      wrap: false,
    });
    expect(result.success).toBe(true);
  });

  it('schema rejects an invalid enum value', () => {
    const result = StackPropsSchema.safeParse({ direction: 'diagonal' });
    expect(result.success).toBe(false);
  });

  it('exposes static meta with description and propsSchema', () => {
    expect(Stack.meta?.description).toBeTruthy();
    expect(Stack.meta?.propsSchema).toBe(StackPropsSchema);
  });
});
