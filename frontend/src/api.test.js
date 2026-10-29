import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, fieldError, listTickets } from './api.js';

function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthenticated = () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const calledPaths = () => fetchMock.mock.calls.map(([url, { method }]) => `${method} ${url}`);

describe('apiFetch', () => {
  it('sends JSON with the session cookies and returns the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { id: 't1' } }));

    const body = await apiFetch('/tickets', { method: 'POST', body: { subject: 'Hello' } });

    expect(body).toEqual({ data: { id: 't1' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/tickets');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', body: '{"subject":"Hello"}' });
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('turns an error response into an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', details: [{ field: 'subject' }], requestId: 'r1' } }),
    );

    const error = await apiFetch('/tickets').catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid request.', details: [{ field: 'subject' }], requestId: 'r1' });
  });

  it('still gives an ApiError when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));

    await expect(apiFetch('/books')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
  });

  it('returns null for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeNull();
  });

  it('refreshes the session once on 401 and retries the request', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthenticated())
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    await expect(apiFetch('/books')).resolves.toEqual({ data: [] });
    expect(calledPaths()).toEqual(['GET /api/v1/books', 'POST /api/v1/auth/refresh', 'GET /api/v1/books']);
  });

  it('shares one refresh between requests that fail at the same time', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(url.endsWith('/auth/refresh') ? jsonResponse(200, { data: {} }) : unauthenticated()),
    );

    await Promise.allSettled([apiFetch('/books'), apiFetch('/tickets')]);

    expect(calledPaths().filter((call) => call.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('gives up with 401 when the refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(unauthenticated()).mockResolvedValueOnce(unauthenticated());

    await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(calledPaths()).toEqual(['GET /api/v1/auth/me', 'POST /api/v1/auth/refresh']);
  });

  it('never refreshes for a failed login', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' } }));

    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fieldError', () => {
  it('finds the message for a body field in a validation error', () => {
    const error = new ApiError({ status: 400, code: 'VALIDATION_ERROR', details: [{ path: 'body.subject', message: 'Too short' }] });

    expect(fieldError(error, 'subject')).toBe('Too short');
    expect(fieldError(error, 'description')).toBeUndefined();
  });

  it('ignores errors whose details are not a field list', () => {
    const error = new ApiError({ status: 422, code: 'UNRESOLVED_PLACEHOLDERS', details: { placeholders: ['[support email]'] } });

    expect(fieldError(error, 'body')).toBeUndefined();
    expect(fieldError(null, 'body')).toBeUndefined();
  });
});

describe('listTickets', () => {
  it('puts only the filters that have a value into the query string', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }));

    await listTickets({ status: 'OPEN,IN_PROGRESS', category: '', priority: undefined, page: 2 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/tickets?status=OPEN%2CIN_PROGRESS&page=2');
  });
});
