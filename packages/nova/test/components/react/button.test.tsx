// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Button, ButtonPropsSchema } from '../../../src/components/react';
import { createHarness } from './helpers';

describe('Button', () => {
  it('renders the label and dispatches ui:click with the layout ref', () => {
    const { Wrapper, dispatch } = createHarness();
    const { container } = render(
      <Wrapper>
        <Button label="Save" novaRef="save-btn" />
      </Wrapper>,
    );
    const btn = container.querySelector('button');
    expect(btn?.textContent).toBe('Save');
    if (btn === null) throw new Error('no button');
    fireEvent.click(btn);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:click', ref: 'save-btn' });
  });

  it('renders children when no label is given', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Button novaRef="x">child</Button>
      </Wrapper>,
    );
    expect(container.querySelector('button')?.textContent).toBe('child');
  });

  it('does not dispatch when there is no novaRef', () => {
    const { Wrapper, dispatch } = createHarness();
    const { container } = render(
      <Wrapper>
        <Button label="No-op" />
      </Wrapper>,
    );
    const btn = container.querySelector('button');
    if (btn === null) throw new Error('no button');
    fireEvent.click(btn);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when disabled', () => {
    const { Wrapper, dispatch } = createHarness();
    const { container } = render(
      <Wrapper>
        <Button label="x" novaRef="x" disabled />
      </Wrapper>,
    );
    const btn = container.querySelector('button');
    if (btn === null) throw new Error('no button');
    fireEvent.click(btn);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('honours variant', () => {
    const { Wrapper } = createHarness();
    const { container } = render(
      <Wrapper>
        <Button label="x" variant="ghost" novaRef="x" />
      </Wrapper>,
    );
    const btn = container.querySelector('button');
    expect(btn?.style.background).toBe('transparent');
  });

  it('schema accepts and rejects', () => {
    expect(
      ButtonPropsSchema.safeParse({ label: 'a', variant: 'secondary', disabled: false }).success,
    ).toBe(true);
    expect(ButtonPropsSchema.safeParse({ variant: 'danger' }).success).toBe(false);
  });

  it('has static meta', () => {
    expect(Button.meta?.description).toBeTruthy();
    expect(Button.meta?.propsSchema).toBe(ButtonPropsSchema);
  });
});
