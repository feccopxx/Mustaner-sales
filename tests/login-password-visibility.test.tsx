import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Login } from '../src/components/Login.js';

vi.mock('../src/api.js', () => ({ api: vi.fn() }));

describe('login password visibility', () => {
  it('lets the user reveal and conceal the password they entered', () => {
    render(<Login onSuccess={() => {}} />);
    const input = screen.getByLabelText('Workspace password');

    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
