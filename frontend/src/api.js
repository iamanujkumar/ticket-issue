const API_BASE = '/api/v1';

const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

export class ApiError extends Error {
  constructor({ status, code = 'UNKNOWN_ERROR', message = 'Something went wrong.', details, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function fieldError(error, field) {
  if (error?.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) {
    return undefined;
  }
  return error.details.find((detail) => detail.path === `body.${field}`)?.message;
}

function send(path, { method = 'GET', body } = {}) {
  const hasBody = body !== undefined;
  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

async function readBody(response) {
  if (response.status === 204) {
    return null;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError({ status: response.status, ...payload?.error });
  }
  return payload;
}

let refreshInFlight = null;

export function refreshSession() {
  refreshInFlight ??= send('/auth/refresh', { method: 'POST' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export async function apiFetch(path, options) {
  let response = await send(path, options);
  if (response.status === 401 && !NO_REFRESH_PATHS.has(path) && (await refreshSession())) {
    response = await send(path, options);
  }
  return readBody(response);
}

function toQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export const queryKeys = {
  books: ['books'],
  royaltySummary: ['books', 'summary'],
  tickets: ['tickets'],
  ticketList: (filters) => ['tickets', 'list', filters],
  ticket: (ticketId) => ['tickets', ticketId],
  messages: (ticketId) => ['tickets', ticketId, 'messages'],
  notes: (ticketId) => ['tickets', ticketId, 'notes'],
  draft: (ticketId) => ['tickets', ticketId, 'draft'],
};

const dataOf = (body) => body.data;
const post = (path, body) => apiFetch(path, { method: 'POST', body }).then(dataOf);

export const login = (credentials) => post('/auth/login', credentials);
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });
export const getMe = () => apiFetch('/auth/me').then(dataOf);

export const listBooks = () => apiFetch('/books').then(dataOf);
export const getRoyaltySummary = () => apiFetch('/books/summary').then(dataOf);

export const listTickets = (filters) => apiFetch(`/tickets${toQuery(filters)}`);
export const getTicket = (ticketId) => apiFetch(`/tickets/${ticketId}`).then(dataOf);
export const createTicket = (ticket) => post('/tickets', ticket);
export const updateTicket = (ticketId, changes) =>
  apiFetch(`/tickets/${ticketId}`, { method: 'PATCH', body: changes }).then(dataOf);

export const listMessages = (ticketId) => apiFetch(`/tickets/${ticketId}/messages`).then(dataOf);
export const postMessage = (ticketId, body) => post(`/tickets/${ticketId}/messages`, { body });
export const listNotes = (ticketId) => apiFetch(`/tickets/${ticketId}/notes`).then(dataOf);
export const postNote = (ticketId, body) => post(`/tickets/${ticketId}/notes`, { body });

export const getDraft = (ticketId) => apiFetch(`/tickets/${ticketId}/ai-draft`).then(dataOf);
export const regenerateDraft = (ticketId) => post(`/tickets/${ticketId}/ai-draft/regenerate`, {});
export const sendDraft = (ticketId, draftId, body) => post(`/tickets/${ticketId}/ai-draft/send`, { draftId, body });
