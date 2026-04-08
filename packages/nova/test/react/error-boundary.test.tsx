// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorMarker, NovaErrorBoundary } from '@react';

const Boom = () => {
  throw new Error('boom');
};

describe('<NovaErrorBoundary> and <ErrorMarker>', () => {
  it('ErrorMarker renders code and message', () => {
    render(<ErrorMarker code="X_FAIL" message="bad" />);
    const el = screen.getByRole('alert');
    expect(el.textContent).toContain('X_FAIL');
    expect(el.textContent).toContain('bad');
  });

  it('catches child errors and renders fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <NovaErrorBoundary fallback={(e) => <div data-testid="fb">{e.message}</div>} onError={onError}>
        <Boom />
      </NovaErrorBoundary>,
    );
    expect(screen.getByTestId('fb').textContent).toBe('boom');
    expect(onError).toHaveBeenCalled();
    spy.mockRestore();
  });
});
