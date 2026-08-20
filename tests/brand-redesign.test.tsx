import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from '../src/components/Login.js';
import { CourseEditor } from '../src/components/CourseEditor.js';
import { emptyCourse } from '../src/types.js';

const apiMock = vi.fn();
vi.mock('../src/api.js', () => ({ api: (...args: unknown[]) => apiMock(...args) }));

describe('Mustaner branded redesign', () => {
  beforeEach(() => apiMock.mockReset());

  it('uses the canonical Mustaner logo and approved illustration in the split login', () => {
    render(<Login onSuccess={() => {}} />);

    expect(screen.getByRole('main')).toHaveClass('login-shell');
    expect(screen.getByRole('img', { name: 'Mustaner' })).toHaveAttribute('src', '/assets/mustaner-logo.webp');
    expect(screen.getByRole('img', { name: /organizing course content/i })).toHaveAttribute('src', '/assets/login-hero.png');
    expect(screen.getByText('One source of truth for every course.')).toBeInTheDocument();
  });

  it('organizes the dedicated course editor into document tabs', () => {
    render(<CourseEditor course={emptyCourse()} isNew onChange={() => {}} onSave={() => {}} onClose={() => {}} busy={false} />);

    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Curriculum')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    expect(screen.getByLabelText('Curriculum')).toBeInTheDocument();
    expect(screen.getByLabelText(/How to sell/)).toBeInTheDocument();
  });

  it('shows the approved API-key illustration when no keys exist', async () => {
    apiMock.mockResolvedValueOnce([]);
    const { ApiKeys } = await import('../src/components/ApiKeys.js');
    render(<ApiKeys />);

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/admin/api-keys'));
    expect(screen.getByRole('img', { name: /securely connecting course data/i })).toHaveAttribute('src', '/assets/empty-api-keys.png');
  });
});
