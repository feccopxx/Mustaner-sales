import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RevisionPanel } from '../src/components/RevisionPanel.js';

describe('RevisionPanel', () => {
  it('offers restoration for each saved revision', () => {
    render(<RevisionPanel revisions={[{ id: 'r1', createdAt: '2026-08-20T10:00:00Z', snapshot: { name: 'Earlier title' } }]} onRestore={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Earlier title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument();
  });
});
