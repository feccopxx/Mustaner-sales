import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api.js';

describe('API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a PDF import as multipart form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ draft: {}, questions: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const body = new FormData();
    body.append('pdf', new File(['pdf'], 'course.pdf', { type: 'application/pdf' }));
    await api('/admin/courses/import-pdf', { method: 'POST', body });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).not.toHaveProperty('content-type');
    expect(options.body).toBe(body);
  });
});
