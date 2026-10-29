import * as ticketService from './ticket.service.js';

export async function createTicket(req, res) {
  const ticket = await ticketService.createTicket(req.user, req.validated.body);
  res.status(201).json({ data: ticket });
}

export async function listTickets(req, res) {
  const { tickets, meta } = await ticketService.listTickets(req.user, req.validated.query);
  res.json({ data: tickets, meta });
}

export async function getTicket(req, res) {
  const ticket = await ticketService.getTicket(req.user, req.validated.params.ticketId);
  res.json({ data: ticket });
}

export async function updateTicket(req, res) {
  const ticket = await ticketService.updateTicket(req.user, req.validated.params.ticketId, req.validated.body);
  res.json({ data: ticket });
}

export async function listMessages(req, res) {
  const messages = await ticketService.listMessages(req.user, req.validated.params.ticketId);
  res.json({ data: messages });
}

export async function addMessage(req, res) {
  const message = await ticketService.addMessage(req.user, req.validated.params.ticketId, req.validated.body);
  res.status(201).json({ data: message });
}

export async function listNotes(req, res) {
  const notes = await ticketService.listNotes(req.user, req.validated.params.ticketId);
  res.json({ data: notes });
}

export async function addNote(req, res) {
  const note = await ticketService.addNote(req.user, req.validated.params.ticketId, req.validated.body);
  res.status(201).json({ data: note });
}

export async function listEvents(req, res) {
  const events = await ticketService.listEvents(req.user, req.validated.params.ticketId);
  res.json({ data: events });
}
