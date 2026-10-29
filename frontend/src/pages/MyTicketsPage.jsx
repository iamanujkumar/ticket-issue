import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { listTickets, queryKeys } from '../api.js';
import { Card, Empty, ErrorBox, Loading, PageTitle, Pagination, StatusBadge } from '../components.jsx';
import { timeAgo } from '../format.js';

const PAGE_SIZE = 20;

export function MyTicketsPage() {
  const [page, setPage] = useState(1);
  const filters = { page, pageSize: PAGE_SIZE };
  const tickets = useQuery({ queryKey: queryKeys.ticketList(filters), queryFn: () => listTickets(filters) });

  return (
    <>
      <PageTitle title="My Tickets">
        <Link to="/tickets/new" className="text-sm font-medium text-emerald-800 underline">
          Raise a support query
        </Link>
      </PageTitle>

      {tickets.isPending && <Loading />}
      {tickets.error && <ErrorBox error={tickets.error} onRetry={tickets.refetch} />}
      {tickets.data?.data.length === 0 && <Empty>You haven&apos;t raised any support queries yet.</Empty>}
      {tickets.data?.data.length > 0 && (
        <>
          <ul className="space-y-3">
            {tickets.data.data.map((ticket) => (
              <li key={ticket.id}>
                <Link to={`/tickets/${ticket.id}`} className="block">
                  <Card className="hover:border-emerald-400">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        <span className="text-slate-500">{ticket.ticketNumber}</span> · {ticket.subject}
                      </p>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {ticket.book?.title ?? 'General / Account Level'} · Updated {timeAgo(ticket.lastActivityAt)}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination meta={tickets.data.meta} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
