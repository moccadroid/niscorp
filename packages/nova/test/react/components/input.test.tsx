// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Input, InputPropsSchema } from '../../../src/components/react';
import { createHarness } from './helpers';

describe('Input', () => {
  it('renders an input with the given type, placeholder and value', () => {
    const { Wrapper } = createHarness();
    render(
      <Wrapper>
        <Input type="email" placeholder="email…" value="a@b" />
      </Wrapper>,
    );
    const el = screen.getByPlaceholderText('email…') as HTMLInputElement;
    expect(el.type).toBe('email');
    expect(el.value).toBe('a@b');
  });

  it('dispatches ui:model when bound and the user types', () => {
    const { Wrapper, dispatch, registry } = createHarness();
    registry.register('Input', Input);
    // Render via the component directly with novaModel injected as render-node would.
    render(
      <Wrapper>
        <Input value="" novaModel={{ ref: 'form', path: 'name' }} />
      </Wrapper>,
    );
    const el = document.querySelector('input');
    expect(el).not.toBeNull();
    if (el === null) return;
    fireEvent.change(el, { target: { value: 'ada' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:model', ref: 'form', payload: 'ada' });
  });

  it('does nothing on change when not bound to a model', () => {
    const { Wrapper, dispatch } = createHarness();
    render(
      <Wrapper>
        <Input value="" />
      </Wrapper>,
    );
    const el = document.querySelector('input');
    if (el === null) throw new Error('no input');
    fireEvent.change(el, { target: { value: 'x' } });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('schema accepts valid props and rejects invalid type', () => {
    expect(
      InputPropsSchema.safeParse({
        type: 'password',
        placeholder: 'pw',
        disabled: true,
        value: 'x',
      }).success,
    ).toBe(true);
    expect(InputPropsSchema.safeParse({ type: 'date' }).success).toBe(false);
  });

  it('has static meta', () => {
    expect(Input.meta?.description).toBeTruthy();
    expect(Input.meta?.propsSchema).toBe(InputPropsSchema);
  });
});
