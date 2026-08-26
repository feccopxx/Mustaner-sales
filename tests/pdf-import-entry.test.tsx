import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.js';

const apiMock = vi.fn();
vi.mock('../src/api.js', () => ({ api: (...args: unknown[]) => apiMock(...args) }));

describe('PDF import entry point', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve({});
      if (path.startsWith('/admin/courses?')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it('opens the illustrated PDF importer from the course library', async () => {
    render(<App />);

    await screen.findByRole('button', { name: 'Import from PDF' });
    fireEvent.click(screen.getByRole('button', { name: 'Import from PDF' }));

    expect(screen.getByRole('heading', { name: 'Import from PDF' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Professional organizing PDF course data into structured learning information' })).toBeInTheDocument();
  });

  it('places the archive control below audit log in the workspace navigation', async () => {
    render(<App />);

    await screen.findByRole('button', { name: 'View archive' });
    const navigation = screen.getByRole('navigation', { name: 'Workspace' });
    expect(Array.from(navigation.querySelectorAll('button')).map(button => button.textContent?.trim())).toEqual([
      'Courses', 'API access', 'Audit log', 'View archive',
    ]);
  });

  it('keeps the manual new-course editor free of PDF extraction controls', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'New course' }));

    expect(screen.getByRole('heading', { name: 'Untitled course' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Course PDF')).not.toBeInTheDocument();
  });
});
