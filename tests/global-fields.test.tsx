import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../src/api.js', () => ({ api: apiMock }));
import App from '../src/App.js';

describe('global field templates', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path === '/auth/session') return Promise.resolve({ authenticated: true });
      if (path === '/admin/global-fields') return Promise.resolve([{ id: 'field-1', name: 'Payment plans', content: 'Ask our team about payment plans.', visibility: 'PUBLIC', position: 0 }]);
      if (path === '/admin/agent-config/draft') return Promise.resolve({ id: 'current', persona: 'Warm Mustaner voice' });
      if (path.startsWith('/admin/courses')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it('copies configured global fields into a newly created course', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Global fields' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Courses' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New course' }));
    fireEvent.click(await screen.findByRole('tab', { name: /Custom fields/ }));

    expect(await screen.findByDisplayValue('Payment plans')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Ask our team about payment plans.')).toBeInTheDocument();
  });

  it('edits and publishes the sales agent persona separately from course templates', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const persona = await screen.findByLabelText('Agent persona and tone');
    expect(persona).toHaveValue('Warm Mustaner voice');
    fireEvent.change(persona, { target: { value: 'Updated Mustaner voice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save agent draft' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/admin/agent-config/draft', expect.objectContaining({ method: 'PUT' })));
    apiMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Publish agent version' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/admin/agent-config/draft', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ persona: 'Updated Mustaner voice' }) })));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/admin/agent-config/publish', expect.objectContaining({ method: 'POST' })));
  });
});
