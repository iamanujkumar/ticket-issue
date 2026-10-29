import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getRoyaltySummary, listBooks, queryKeys } from '../api.js';
import { Badge, Card, Empty, ErrorBox, Loading, PageTitle } from '../components.jsx';
import { BOOK_STATUS, PRODUCTION_STAGE, formatDate, formatMoney, label } from '../format.js';

export function MyBooksPage() {
  const summary = useQuery({ queryKey: queryKeys.royaltySummary, queryFn: getRoyaltySummary });
  const books = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });

  return (
    <>
      <PageTitle title="My Books">
        <Link to="/tickets/new" className="text-sm font-medium text-emerald-800 underline">
          Raise a support query
        </Link>
      </PageTitle>

      {summary.isPending && <Loading />}
      {summary.error && <ErrorBox error={summary.error} onRetry={summary.refetch} />}
      {summary.data && <RoyaltySummary summary={summary.data} />}

      <h2 className="mb-3 mt-8 font-semibold">Books</h2>
      {books.isPending && <Loading />}
      {books.error && <ErrorBox error={books.error} onRetry={books.refetch} />}
      {books.data?.length === 0 && <Empty>You don&apos;t have any books with BookLeaf yet.</Empty>}
      {books.data?.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {books.data.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </>
  );
}

function payoutMessage({ totals, payout }) {
  if (totals.pending.amountMinor === 0) {
    return 'You have no pending royalties right now.';
  }
  if (payout.isBelowThreshold) {
    return `Your pending royalties are below the ${formatMoney(payout.threshold)} minimum payout, so they roll over to the next quarter.`;
  }
  return `Next payout: ${payout.nextPayout.quarter} royalties, paid by ${formatDate(payout.nextPayout.paidBy)}.`;
}

function RoyaltySummary({ summary }) {
  return (
    <section>
      <div className="grid gap-4 sm:grid-cols-3">
        <Amount title="Total royalty earned" money={summary.totals.earned} />
        <Amount title="Royalty paid" money={summary.totals.paid} />
        <Amount title="Royalty pending" money={summary.totals.pending} />
      </div>
      <p className="mt-3 text-sm text-slate-600">
        {payoutMessage(summary)}{' '}
        {summary.lastPayoutDate ? `Last payout: ${formatDate(summary.lastPayoutDate)}.` : 'No payout has been made yet.'}
      </p>
    </section>
  );
}

function Amount({ title, money }) {
  return (
    <Card>
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{formatMoney(money)}</p>
    </Card>
  );
}

function BookCard({ book }) {
  const inProduction = book.status === 'IN_PRODUCTION';

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold">{book.title}</h3>
        {inProduction ? (
          <Badge tone="amber">Book in production · {label(PRODUCTION_STAGE, book.productionStage)}</Badge>
        ) : (
          <Badge tone="green">{label(BOOK_STATUS, book.status)}</Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Detail term="ISBN" value={book.isbn} />
        <Detail term="Genre" value={book.genre} />
        <Detail term="Publication date" value={inProduction ? 'Not published yet' : formatDate(book.publicationDate)} />
        <Detail term="MRP" value={formatMoney(book.mrp)} />
        <Detail term="Copies sold" value={book.copiesSold.toLocaleString('en-IN')} />
        <Detail term="Royalty earned" value={formatMoney(book.royaltyEarned)} />
        <Detail term="Royalty paid" value={formatMoney(book.royaltyPaid)} />
        <Detail term="Royalty pending" value={formatMoney(book.royaltyPending)} />
      </dl>

      <Link to={`/tickets/new?bookId=${book.id}`} className="mt-4 inline-block text-sm text-emerald-800 underline">
        Ask about this book
      </Link>
    </Card>
  );
}

function Detail({ term, value }) {
  return (
    <div>
      <dt className="text-slate-500">{term}</dt>
      <dd className="font-medium">{value ?? '—'}</dd>
    </div>
  );
}
