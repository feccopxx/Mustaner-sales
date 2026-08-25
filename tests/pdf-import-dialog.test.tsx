import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfImport } from '../src/components/PdfImport.js';

const apiMock = vi.fn();
vi.mock('../src/api.js', () => ({ api: (...args: unknown[]) => apiMock(...args) }));

describe('PDF course import panel', () => {
  beforeEach(() => apiMock.mockReset());

  it('shows the AI questions when an imported PDF has incomplete details', async () => {
    apiMock.mockResolvedValue({
      draft: { id: '', name: 'AI Growth', shortDescription: '', price: '', curriculum: '', howToSell: '', status: 'DRAFT', customFields: [], mediaLinks: [] },
      questions: [{ field: 'price', question: 'Please provide the course price.' }],
    });
    const onImport = vi.fn();
    render(<PdfImport onImport={onImport} />);

    fireEvent.change(screen.getByLabelText('Course PDF'), { target: { files: [new File(['pdf'], 'course.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract course details' }));

    expect(await screen.findByText('Please provide the course price.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fill remaining data manually' }));
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ name: 'AI Growth' }));
  });
});
