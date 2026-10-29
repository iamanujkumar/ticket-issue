import { describe, expect, it } from 'vitest';
import {
  toAdminTicket,
  toAuthorTicket,
  toEvent,
  toMessage,
  toTicketNumber,
} from '../../../src/modules/ticket_module/ticket.mapper.js';

const CREATED_AT = new Date('2026-10-29T00:00:00Z');

const ticketRow = {
  id: 'ticket-1',
  number: 42,
  subject: 'Royalty not received',
  description: "I haven't received any royalty.",
  status: 'OPEN',
  category: 'ROYALTY_PAYMENTS',
  categorySource: 'RULES',
  priority: 'HIGH',
  prioritySource: 'RULES',
  aiCategory: null,
  aiPriority: null,
  aiConfidence: null,
  aiRationale: null,
  triageStatus: 'PENDING',
  needsReview: false,
  slaDueAt: new Date('2026-10-30T00:00:00Z'),
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  lastActivityAt: CREATED_AT,
  createdAt: CREATED_AT,
  version: 1,
  author: { id: 'author-1', user: { name: 'Priya Sharma' } },
  book: { id: 'book-1', code: 'BK001', title: 'Whispers of the Ganges' },
  assignee: null,
};

describe('toTicketNumber', () => {
  it('pads the number to six digits', () => {
    expect(toTicketNumber(42)).toBe('BL-000042');
    expect(toTicketNumber(1234567)).toBe('BL-1234567');
  });
});

describe('toAuthorTicket', () => {
  it('returns only fields an author may see', () => {
    expect(Object.keys(toAuthorTicket(ticketRow)).sort()).toEqual(
      [
        'book',
        'category',
        'closedAt',
        'createdAt',
        'description',
        'id',
        'lastActivityAt',
        'resolvedAt',
        'status',
        'subject',
        'ticketNumber',
      ].sort(),
    );
  });

  it('shows a general ticket without a book', () => {
    expect(toAuthorTicket({ ...ticketRow, book: null }).book).toBeNull();
  });
});

describe('toAdminTicket', () => {
  it('adds triage, assignment and SLA details', () => {
    const ticket = toAdminTicket({ ...ticketRow, aiConfidence: '0.85' }, new Date('2026-10-31T00:00:00Z'));

    expect(ticket).toMatchObject({
      ticketNumber: 'BL-000042',
      priority: 'HIGH',
      prioritySource: 'RULES',
      ai: { category: null, priority: null, confidence: 0.85, rationale: null },
      author: { id: 'author-1', name: 'Priya Sharma' },
      assignee: null,
      slaDueAt: '2026-10-30T00:00:00.000Z',
      isOverdue: true,
      version: 1,
    });
  });
});

describe('toMessage', () => {
  const adminMessage = {
    id: 'm1',
    body: 'Hi',
    senderRole: 'ADMIN',
    sender: { name: 'Aditi Rao' },
    createdAt: CREATED_AT,
  };

  it('hides the admin name from authors', () => {
    expect(toMessage(adminMessage, { forAuthor: true }).senderName).toBe('BookLeaf Support');
  });

  it('shows the admin name to admins', () => {
    expect(toMessage(adminMessage, { forAuthor: false }).senderName).toBe('Aditi Rao');
  });

  it("shows the author's own name", () => {
    const authorMessage = { ...adminMessage, senderRole: 'AUTHOR', sender: { name: 'Priya Sharma' } };

    expect(toMessage(authorMessage, { forAuthor: true }).senderName).toBe('Priya Sharma');
  });
});

describe('toEvent', () => {
  it('marks system events with a null actor', () => {
    const event = toEvent({ id: 'e1', type: 'CREATED', fromValue: null, toValue: null, actor: null, createdAt: CREATED_AT });

    expect(event).toEqual({ id: 'e1', type: 'CREATED', from: null, to: null, actor: null, createdAt: '2026-10-29T00:00:00.000Z' });
  });
});
