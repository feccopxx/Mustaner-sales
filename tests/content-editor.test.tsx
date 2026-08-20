import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownField } from '../src/components/MarkdownField.js';

describe('MarkdownField', () => {
  it('switches to RTL for Arabic content while preserving an explicit override', () => {
    const { rerender } = render(<MarkdownField label="Curriculum" value="منهج AI" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('dir', 'rtl');
    rerender(<MarkdownField label="Curriculum" value="منهج AI" direction="ltr" onDirectionChange={() => {}} onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('dir', 'ltr');
  });

  it('reports edited Markdown', () => {
    let value = '';
    render(<MarkdownField label="Price" value={value} onChange={(next) => { value = next; }} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'EGP **5,000**' } });
    expect(value).toBe('EGP **5,000**');
  });
});
