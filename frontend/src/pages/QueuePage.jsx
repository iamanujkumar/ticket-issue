import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listTickets, queryKeys } from '../api.js';
import { Badge, Button, Empty, ErrorBox, Loading, PageTitle, Pagination, PriorityBadge, SlaBadge, StatusBadge, inputClass } from '../components.jsx';
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS, label, timeAgo } from '../format.js';

const PAGE_SIZE = 25;
const UNRESOLVED = 'OPEN,IN_PROGRESS';

const DEFAULT_FILTERS = {
  status: UNRESOLVED,
  category: '',
  priority: '',
  createdFrom: '',
  createdTo: '',
  sort: 'queue',
};

const SORTS = {
  queue: 'Most urgent first',
  oldest: 'Oldest first',
  newest: 'Newest first',
  updated: 'Recently updated',
};

export function QueuePage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const params = { ...filters, page, pageSize: PAGE_SIZE };
  const tickets = useQuery({ queryKey: queryKeys.ticketList(params), queryFn: () => listTickets(params) });

  function changeFilter(name, value) {
    setFilters({ ...filters, [name]: value });
    setPage(1);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  return (
    <>
      <PageTitle title="Ticket Queue">
        {tickets.data && <span className="text-sm text-slate-600">{tickets.data.meta.total} tickets</span>}
      </PageTitle>

      <Filters filters={filters} onChange={changeFilter} onReset={resetFilters} />

      {tickets.isPending && <Loading />}
      {tickets.error && <ErrorBox error={tickets.error} onRetry={tickets.refetch} />}
      {tickets.data?.data.length === 0 && <Empty>No tickets match these filters.</Empty>}
      {tickets.data?.data.length > 0 && (
        <>
          <QueueTable tickets={tickets.data.data} />
          <Pagination meta={tickets.data.meta} onPageChange={setPage} />
        </>
      )}
    </>
  );
}

function Filters({ filters, onChange, onReset }) {
  const select = (name, allLabel, options) => (
    <select className={inputClass} value={filters[name]} onChange={(event) => onChange(name, event.target.value)} aria-label={name}>
      <option value="">{allLabel}</option>
      {Object.entries(options).map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
      {select('status', 'All statuses', { [UNRESOLVED]: 'Unresolved', ...TICKET_STATUS })}
      {select('category', 'All categories', TICKET_CATEGORY)}
      {select('priority', 'All priorities', TICKET_PRIORITY)}
      <input type="date" className={inputClass} value={filters.createdFrom} onChange={(event) => onChange('createdFrom', event.target.value)} aria-label="Created from" title="Created from" />
      <input type="date" className={inputClass} value={filters.createdTo} onChange={(event) => onChange('createdTo', event.target.value)} aria-label="Created to" title="Created to" />
      <select className={inputClass} value={filters.sort} onChange={(event) => onChange('sort', event.target.value)} aria-label="Sort">
        {Object.entries(SORTS).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <Button variant="secondary" onClick={onReset}>
        Reset filters
      </Button>
    </div>
  );
}

function QueueTable({ tickets }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Ticket</th>
            <th className="px-3 py-2">Author</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Age</th>
            <th className="px-3 py-2">Assignee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => navigate(`/admin/tickets/${ticket.id}`)}
              className={`cursor-pointer ${ticket.isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}
            >
              <td className="px-3 py-2">
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td className="px-3 py-2">
                <Link to={`/admin/tickets/${ticket.id}`} className="font-medium text-emerald-800 hover:underline">
                  {ticket.subject}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {ticket.ticketNumber}
                  <SlaBadge ticket={ticket} />
                  {ticket.needsReview && <Badge tone="amber">Needs review</Badge>}
                </div>
              </td>
              <td className="px-3 py-2">{ticket.author.name}</td>
              <td className="px-3 py-2">{label(TICKET_CATEGORY, ticket.category)}</td>
              <td className="px-3 py-2">
                <StatusBadge status={ticket.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{timeAgo(ticket.createdAt)}</td>
              <td className="px-3 py-2 text-slate-600">{ticket.assignee?.name ?? 'Unassigned'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
