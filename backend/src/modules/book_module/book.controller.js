import * as bookService from './book.service.js';

export async function listBooks(req, res) {
  const books = await bookService.listBooks(req.user, req.validated.query);
  res.json({ data: books });
}

export async function getRoyaltySummary(req, res) {
  const summary = await bookService.getRoyaltySummary(req.user);
  res.json({ data: summary });
}

export async function getBook(req, res) {
  const book = await bookService.getBook(req.user, req.validated.params.bookId);
  res.json({ data: book });
}
