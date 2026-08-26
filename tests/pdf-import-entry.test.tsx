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

  it('uses a header file chooser and keeps extraction beneath the focal illustration', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Import from PDF' }));

    expect(screen.getByText('Choose file').closest('label')).toHaveAttribute('for', 'course-pdf');
    const importer = screen.getByLabelText('Import course from PDF');
    expect(importer.querySelector('.pdf-import-illustration')?.nextElementSibling?.textContent).toContain('Extract course details');
    expect(screen.getByLabelText('Course PDF')).toHaveClass('visually-hidden');
  });

  it('places the archive control below audit log in the workspace navigation', async () => {
    render(<App />);

    await screen.findByRole('button', { name: 'View archive' });
    const navigation = screen.getByRole('navigation', { name: 'Workspace' });
    expect(Array.from(navigation.querySelectorAll('button')).map(button => button.textContent?.trim())).toEqual([
      'Courses', 'API access', 'Audit log', 'Settings', 'View archive',
    ]);
  });

  it('keeps the manual new-course editor free of PDF extraction controls', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'New course' }));

    expect(screen.getByRole('heading', { name: 'Untitled course' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Course PDF')).not.toBeInTheDocument();
  });

  it('returns each selected archived course to the active library', async () => {
    const archivedCourse = { id: '83', name: 'Archived AI Course', shortDescription: '', price: '', curriculum: '', howToSell: '', status: 'DRAFT', customFields: [], mediaLinks: [] };
    apiMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve({});
      if (path === '/admin/courses?archived=true') return Promise.resolve([archivedCourse]);
      return Promise.resolve([]);
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'View archive' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Archived AI Course' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to Course' }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/admin/courses/83/restore', { method: 'POST' }));
  });
});
